import Database from 'better-sqlite3';

export interface MatchTransfersOptions {
  sampleLimit?: number;
}

export interface MatchTransaction {
  id: number;
  accountId: string;
  postedDate: string;
  description: string;
  amount: string;
}

export interface MatchedPair {
  debit: MatchTransaction;
  credit: MatchTransaction;
  dayDelta: number;
}

export interface MatchSummary {
  pairsMatched: number;
  transactionsHidden: number;
  sample: MatchedPair[];
}

interface RawPairRow {
  debit_id: number;
  debit_account: string;
  debit_date: string;
  debit_description: string;
  debit_amount_text: string;
  credit_id: number;
  credit_account: string;
  credit_date: string;
  credit_description: string;
  credit_amount_text: string;
  day_gap: number;
}

export function matchTransfers(
  db: Database.Database,
  options: MatchTransfersOptions = {},
): MatchSummary {
  const sampleLimit = options.sampleLimit ?? 5;
  if (!Number.isFinite(sampleLimit) || sampleLimit < 0) {
    throw new Error('sampleLimit must be a non-negative finite number');
  }

  const candidateRows = fetchCandidatePairs(db);
  const matchedRows: RawPairRow[] = [];
  const seen = new Set<number>();

  for (const row of candidateRows) {
    if (seen.has(row.debit_id) || seen.has(row.credit_id)) {
      continue;
    }
    seen.add(row.debit_id);
    seen.add(row.credit_id);
    matchedRows.push(row);
  }

  if (matchedRows.length > 0) {
    const updateHidden = db.prepare('UPDATE transactions SET hidden = 1 WHERE id = ?');
    const applyMatches = db.transaction(() => {
      matchedRows.forEach((row) => {
        updateHidden.run(row.debit_id);
        updateHidden.run(row.credit_id);
      });
    });
    applyMatches();
  }

  const sample = matchedRows.slice(0, sampleLimit).map<MatchedPair>((row) => ({
    dayDelta: Number(row.day_gap ?? 0),
    debit: {
      id: row.debit_id,
      accountId: row.debit_account,
      postedDate: row.debit_date,
      description: row.debit_description,
      amount: row.debit_amount_text,
    },
    credit: {
      id: row.credit_id,
      accountId: row.credit_account,
      postedDate: row.credit_date,
      description: row.credit_description,
      amount: row.credit_amount_text,
    },
  }));

  return {
    pairsMatched: matchedRows.length,
    transactionsHidden: matchedRows.length * 2,
    sample,
  };
}

function fetchCandidatePairs(db: Database.Database): RawPairRow[] {
  const statement = db.prepare(`
    SELECT
      debit.id AS debit_id,
      debit.account_id AS debit_account,
      debit.posted_date AS debit_date,
      debit.description AS debit_description,
      debit.amount AS debit_amount_text,
      credit.id AS credit_id,
      credit.account_id AS credit_account,
      credit.posted_date AS credit_date,
      credit.description AS credit_description,
      credit.amount AS credit_amount_text,
      ABS(julianday(debit.posted_date) - julianday(credit.posted_date)) AS day_gap
    FROM transactions AS debit
    JOIN transactions AS credit
      ON debit.amount_cents = -credit.amount_cents
     AND debit.account_id != credit.account_id
     AND debit.amount_cents < 0
     AND credit.amount_cents > 0
    WHERE debit.hidden = 0
      AND credit.hidden = 0
      AND ABS(julianday(debit.posted_date) - julianday(credit.posted_date)) <= 3
    ORDER BY day_gap ASC, debit.posted_date ASC, credit.posted_date ASC, debit.id ASC, credit.id ASC
  `);

  return statement.all() as RawPairRow[];
}
