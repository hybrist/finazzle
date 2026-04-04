import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import type Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { registerShadowCommands } from '../src/shadow-register/commands';
import { openShadowRegister } from '../src/shadow-register/importer';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

describe('Chase CLI flow', () => {
  let dataDir: string;
  const dbFile = 'shadow-chase.db';

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finazzle-chase-'));
  });

  afterEach(() => {
    if (dataDir && fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  test('normalizes Chase fixtures, imports them, and matches transfers via CLI', async () => {
    const normalizedDir = path.join(dataDir, 'normalized');
    const cardFixture = path.join(FIXTURES_DIR, 'chase-card.csv');
    const checkingFixture = path.join(FIXTURES_DIR, 'chase-checking.csv');

    const normalizedCard = path.join(normalizedDir, 'chase-card-normalized.csv');
    const normalizedChecking = path.join(normalizedDir, 'chase-checking-normalized.csv');

    normalizeChaseCardFixture(cardFixture, normalizedCard, {
      accountId: 'chase_card_1267',
      source: 'chase_card_e2e',
    });
    normalizeChaseCheckingFixture(checkingFixture, normalizedChecking, {
      accountId: 'chase_checking_8886',
      source: 'chase_checking_e2e',
    });

    const checkingArg = path.relative(dataDir, normalizedChecking);
    const cardArg = path.relative(dataDir, normalizedCard);

    await runShadowCli([
      'shadow',
      'import',
      checkingArg,
      cardArg,
      '--data-dir',
      dataDir,
      '--db-file',
      dbFile,
      '--silent',
    ]);

    const matchLogs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      matchLogs.push(args.map((value) => String(value)).join(' '));
    });
    try {
      await runShadowCli([
        'shadow',
        'match',
        '--data-dir',
        dataDir,
        '--db-file',
        dbFile,
        '--sample-size',
        '5',
      ]);
    } finally {
      logSpy.mockRestore();
    }

    expect(matchLogs.some((line) => line.includes('Matched 1 transfer pairs'))).toBe(true);

    const { db } = openShadowRegister({ dataDir, dbFile });
    try {
      const totalTx = db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as { count: number };
      expect(totalTx.count).toBe(10);

      const hiddenRows = db
        .prepare('SELECT COUNT(*) AS count FROM transactions WHERE hidden = 1')
        .get() as { count: number };
      expect(hiddenRows.count).toBe(2);

      expect(getHiddenFlag(db, 'chase_checking_8886', '2025-12-08', 'SAMPLE CREDIT CARD PAYMT')).toBe(1);
      expect(getHiddenFlag(db, 'chase_card_1267', '2025-12-09', 'SAMPLE CREDIT CARD PAYMENT')).toBe(1);

      expect(getHiddenFlag(db, 'chase_checking_8886', '2026-01-20', 'SAMPLE CREDIT CARD PAYMT')).toBe(0);
      expect(getHiddenFlag(db, 'chase_card_1267', '2026-01-16', 'SAMPLE CREDIT CARD PAYMENT')).toBe(0);

      expect(getHiddenFlag(db, 'chase_checking_8886', '2026-03-01', 'SAMPLE CREDIT CARD PAYMT')).toBe(0);
      expect(getHiddenFlag(db, 'chase_card_1267', '2026-03-01', 'SAMPLE CREDIT CARD PAYMENT')).toBe(0);
    } finally {
      db.close();
    }
  });
});

async function runShadowCli(args: string[]) {
  const program = new Command();
  program.name('finazzle');
  program.exitOverride();
  registerShadowCommands(program);
  await program.parseAsync(args, { from: 'user' });
}

interface NormalizationOptions {
  accountId: string;
  source: string;
}

interface NormalizedRow {
  date: string;
  description: string;
  amount: string;
  account_id: string;
  source: string;
}

interface ChaseCardRow {
  'Transaction Date': string;
  'Post Date': string;
  Description: string;
  Category: string;
  Type: string;
  Amount: string;
}

interface ChaseCheckingRow {
  Details: string;
  'Posting Date': string;
  Description: string;
  Amount: string;
  Type: string;
}

function normalizeChaseCardFixture(inputPath: string, outputPath: string, options: NormalizationOptions) {
  const rows = loadCsv<ChaseCardRow>(inputPath);
  const normalized = rows.map<NormalizedRow>((row) => ({
    date: toIsoDate(row['Post Date']),
    description: row.Description.trim(),
    amount: normalizeAmountText(row.Amount),
    account_id: options.accountId,
    source: options.source,
  }));
  writeNormalizedCsv(outputPath, normalized);
}

function normalizeChaseCheckingFixture(
  inputPath: string,
  outputPath: string,
  options: NormalizationOptions,
) {
  const rows = loadCsv<ChaseCheckingRow>(inputPath);
  const normalized = rows.map<NormalizedRow>((row) => ({
    date: toIsoDate(row['Posting Date']),
    description: row.Description.trim(),
    amount: normalizeAmountText(row.Amount),
    account_id: options.accountId,
    source: options.source,
  }));
  writeNormalizedCsv(outputPath, normalized);
}

function loadCsv<T>(filePath: string): T[] {
  const csv = fs.readFileSync(filePath, 'utf8');
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function writeNormalizedCsv(filePath: string, rows: NormalizedRow[]) {
  const header = ['date', 'description', 'amount', 'account_id', 'source'];
  const lines = rows.map((row) =>
    header
      .map((key) => csvEscape(row[key as keyof NormalizedRow]))
      .join(','),
  );

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const csv = [header.join(','), ...lines].join('\n');
  fs.writeFileSync(filePath, csv);
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeAmountText(raw: string): string {
  const sanitized = raw.replace(/,/g, '').trim();
  if (!sanitized) {
    throw new Error('amount must not be empty');
  }
  const numeric = Number.parseFloat(sanitized);
  if (!Number.isFinite(numeric)) {
    throw new Error(`invalid amount: ${raw}`);
  }
  return numeric.toFixed(2);
}

function toIsoDate(raw: string): string {
  const [month, day, yearPart] = raw.split('/');
  if (!month || !day || !yearPart) {
    throw new Error(`invalid date: ${raw}`);
  }
  const numericMonth = month.padStart(2, '0');
  const numericDay = day.padStart(2, '0');
  const yearNumber = Number.parseInt(yearPart, 10);
  if (!Number.isFinite(yearNumber)) {
    throw new Error(`invalid date: ${raw}`);
  }
  const normalizedYear = yearPart.length === 2 ? 2000 + yearNumber : yearNumber;
  return `${normalizedYear.toString().padStart(4, '0')}-${numericMonth}-${numericDay}`;
}

function getHiddenFlag(
  db: Database.Database,
  accountId: string,
  postedDate: string,
  description: string,
): number {
  const row = db
    .prepare(
      `SELECT hidden FROM transactions WHERE account_id = ? AND posted_date = ? AND description = ?`,
    )
    .get(accountId, postedDate, description) as { hidden: number } | undefined;
  if (!row) {
    throw new Error(`Transaction not found for ${accountId} ${postedDate} ${description}`);
  }
  return row.hidden;
}
