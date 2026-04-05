# Local Data Staging

This directory is the drop zone for any raw exports and config secrets used by the CLI. Everything under `data/` besides this README stays out of git so you can iterate on the ingestion tooling without leaking personal information.

## Recommended Layout

```
data/
  checking/          # CSV exports from checking accounts
  savings/           # CSV exports from savings/high-yield accounts
  credit/            # CSV exports from each credit card issuer
  config/            # Connection details, API tokens, or per-bank notes
```

Feel free to tailor the subfolders, but keep financial institutions grouped so the import commands can glob predictable paths (e.g. `data/checking/*.csv`).

## CSV Requirements

Phase 1 of the CLI expects normalized columns when loading into the SQLite "Shadow Register":

| Column        | Description                                             |
| ------------- | ------------------------------------------------------- |
| `date`        | ISO-8601 date string (`YYYY-MM-DD`)                     |
| `description` | Merchant or transfer memo exactly as exported           |
| `amount`      | Signed decimal in native currency (credits are positive |
| `account_id`  | Stable identifier you assign per source account         |
| `source`      | Short label (e.g. `boa_checking`, `amex_blue`)          |

If a bank export ships different headers, adjust them before dropping the file here so the importer can ingest without custom parsers.

## Normalizing Raw Bank Exports

`finazzle shadow import` can now remap CSV headers on the fly. Pass `--mapping config/checking.json` (relative to the data directory) to describe how a bank's export should translate into the canonical schema plus which metadata to inject:

```
{
  "columns": {
    "Transaction Date": "date",
    "Details": "description",
    "Amount": "amount"
  },
  "defaults": {
    "account_id": "checking_demo",
    "source": "chase_checking"
  }
}
```

- `columns` keys are the raw headers present in the CSV.
- `columns` values must be one of `date`, `description`, `amount`, `account_id`, or `source`.
- `defaults` fills in canonical columns that are missing or blank (handy for `account_id`/`source`).

The mapping file lives alongside your exports (for example `data/config/chase-checking.json`). When you run the importer, each row is normalized according to this mapping before validation, so you can point at raw bank downloads without editing them first.

## Config Files

Place API tokens, institution credentials, or CLI overrides under `data/config/`. These files are intentionally untracked. When you need to share environment defaults, create template files (e.g. `env.example`) outside of `data/` and keep the secrets here.

## How the CLI Uses This Directory

The `finazzle shadow import` command ingests CSV files relative to this directory. For example:

```
FINAZZLE_DATA_DIR=./data pnpm --filter @finazzle/cli run cli -- shadow import checking/jan.csv credit/amex.csv
```

- Omit `FINAZZLE_DATA_DIR` to default to `./data`, or pass `--data-dir /custom/path` per run.
- Paths are resolved after the data directory, so `checking/jan.csv` reads `data/checking/jan.csv`.
- Imports are idempotent—running the same command twice will skip rows already present in the
  database.

Keeping everything inside `data/` ensures the SQLite "Shadow Register" and raw exports stay out of
git while remaining easy to refresh or wipe locally.
