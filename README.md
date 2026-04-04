# Project Plan: Personal Cash Flow & Liability Modeler

This plan outlines an iterative approach to building a local-first application designed to strip away "transaction noise" (internal transfers and bill payments) to focus entirely on liability-based spending trends.

---

## 1. Core Principles
* **Liability-First:** Only the point of purchase matters. Credit card payments are treated as non-events (noise).
* **Zero Scale Requirement:** Optimized for a single user's data patterns.
* **Local-Only:** Privacy by design; no third-party cloud processing for categorization.
* **Iterative Classification:** Human-in-the-loop refinement to move from raw strings to meaningful categories.

---

## 2. Phase 1: Data Normalization & Noise Reduction
**Goal:** Create a clean "Source of Truth" by identifying and neutralizing internal money movement.

### Tasks:
* **The "Shadow" Register:** Develop a schema that imports CSV/API data from all sources (Checking, Savings, Credit Cards) into a unified SQLite database.
* **Transfer Matching Engine:** Implement a logic gate to identify "Net-Zero" events.
    * *Logic:* Match a debit in Account A with a credit in Account B within a $\pm 3$ day window and a 0% price variance.
* **Noise Suppression:** Create a `hidden` flag in the database for these matched pairs so they are excluded from spending calculations but preserved for audit.

---

## 3. Phase 2: The Iterative Classifier (The "Right Fit" Engine)
**Goal:** Build a system that learns the user's specific merchant nomenclature without over-engineering.

### The 3-Tier Classification Strategy:
1.  **Tier 1: Static Rules (Regex):** * User-defined patterns (e.g., `^RECURRING.*NETFLIX` -> `Subscription`).
2.  **Tier 2: Historical Inference:** * If a merchant string matches a previously categorized transaction with 90%+ confidence, auto-assign.
3.  **Tier 3: The Manual "Inbox":** * A UI/CLI prompt for uncategorized items. When the user assigns a category, the system generates a **suggested rule** for Tier 1.

---

## 4. Phase 3: Analytical Modeling
**Goal:** Differentiate between the "Baseline" (Recurring) and "Spikes" (Special Occasions).

### Metrics to Compute:
* **The Recurring Floor:** A rolling average of fixed-date liabilities.
* **Special Occasion Variance:** Identifying transactions that fall outside of the $1\sigma$ (Standard Deviation) of a category's typical monthly volume.
* **Effective Liquidity:** A "True Balance" view that subtracts pending liabilities from current cash on hand.

---

## 5. Phase 4: Visualization & Review
**Goal:** Generate scannable trends that highlight where money is actually going.

### Visual Targets:
* **Stacked Area Charts:** To visualize "Fixed" costs as a foundation with "Discretionary/Special" costs layered on top.
* **Merchant Drills:** A view to see if a "Special Occasion" merchant is secretly becoming a "Recurring" habit.

---

## 6. Implementation Roadmap (Local Stack)

| Step | Focus | Tooling Suggestion |
| :--- | :--- | :--- |
| **01** | Data Ingestion | Python (Pandas) or Node.js (csv-parser) |
| **02** | Storage | SQLite (Single-file portability) |
| **03** | Logic | Regex-based matching + Manual Review CLI |
| **04** | Output | Static HTML (Vega-Lite) or simple Dashboard UI |

---

> **Immediate Next Step:** Identify the "Noise Fingerprints" in your current bank exports. Look for the specific strings used for Credit Card payments and internal transfers to seed the Phase 1 suppression engine.

---

## Local Workspace

### Requirements
- Node.js 20+
- pnpm 9+

### Install & Run
1. Install dependencies once: `pnpm install`
2. Execute the CLI banner in watch mode: `pnpm cli`
3. Build the CLI binary + run it via the package script: `pnpm --filter @finazzle/cli run cli`

Additional scripts are available from the repo root:

```
pnpm build   # builds every workspace package
pnpm lint    # runs eslint in each package
pnpm test    # executes package-level test suites
```

## Shadow Register CLI

The CLI exposes a `shadow` namespace for the local SQLite "Shadow Register". Use the `import`
subcommand to normalize CSV exports into `data/shadow-register.db` (or a custom path):

```
pnpm --filter @finazzle/cli run cli -- shadow import checking/jan.csv credit/amex.csv
```

- CSV headers must match `date`, `description`, `amount`, `account_id`, and `source` (see
  `data/README.md` for details).
- Relative paths resolve from the data directory (`./data` by default). Override with
  `--data-dir <path>` or `FINAZZLE_DATA_DIR=/custom/data`.
- The importer deduplicates transactions by account/date/description/amount and reports how many
  rows were added.

The SQLite schema for `accounts` and `transactions` lives in
`packages/cli/src/shadow-register/schema.ts` and is applied automatically the first time you run an
import.
