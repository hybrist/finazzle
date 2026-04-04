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

## Config Files

Place API tokens, institution credentials, or CLI overrides under `data/config/`. These files are intentionally untracked. When you need to share environment defaults, create template files (e.g. `env.example`) outside of `data/` and keep the secrets here.

## How the CLI Uses This Directory

All ingestion commands will default to `./data` as their root. The upcoming `shadow import` command resolves paths relative to this directory unless you override it with `--data-dir` or the `FINAZZLE_DATA_DIR` environment variable. That keeps every prototype run local while making it easy to wipe/refresh inputs without touching git history.
