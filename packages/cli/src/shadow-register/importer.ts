import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import { shadowRegisterSchema } from './schema';

const DEFAULT_DB_FILE = 'shadow-register.db';

export interface ShadowRegisterConfig {
  dataDir?: string;
  dbFile?: string;
}

export interface ImportContext {
  dataDir: string;
}

export interface ImportSummary {
  file: string;
  absolutePath: string;
  inserted: number;
  skipped: number;
  accountsTouched: number;
}

interface NormalizedRow {
  accountId: string;
  source: string;
  postedDate: string;
  description: string;
  amountCents: number;
  amountText: string;
  rowNumber: number;
}

export function resolveDataDir(preferred?: string): string {
  const envOverride = process.env.FINAZZLE_DATA_DIR;
  const candidate = preferred ?? envOverride ?? path.join(process.cwd(), 'data');
  return path.resolve(candidate);
}

export function openShadowRegister(config: ShadowRegisterConfig = {}) {
  const dataDir = resolveDataDir(config.dataDir);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbFile = config.dbFile ?? DEFAULT_DB_FILE;
  const dbPath = path.resolve(dataDir, dbFile);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(shadowRegisterSchema);

  return { db, dataDir, dbPath };
}

export function importCsvFiles(
  db: Database.Database,
  files: string[],
  context: ImportContext,
): ImportSummary[] {
  if (files.length === 0) {
    throw new Error('At least one CSV file path is required');
  }

  return files.map((inputPath) => importSingleFile(db, inputPath, context));
}

function importSingleFile(
  db: Database.Database,
  inputPath: string,
  context: ImportContext,
): ImportSummary {
  const absolutePath = resolveFilePath(inputPath, context.dataDir);
  const displayName = path.relative(context.dataDir, absolutePath) || path.basename(absolutePath);
  const fileContent = fs.readFileSync(absolutePath, 'utf8');
  const parsedRows = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  const normalizedRows = parsedRows.map((row, index) =>
    normalizeRow(row, index + 2, displayName),
  );

  const upsertAccount = db.prepare(
    `INSERT INTO accounts (id, source)
     VALUES (@id, @source)
     ON CONFLICT(id) DO UPDATE SET source=excluded.source, updated_at=datetime('now')`,
  );
  const insertTransaction = db.prepare(
    `INSERT OR IGNORE INTO transactions (
        account_id,
        posted_date,
        description,
        amount_cents,
        amount,
        source,
        source_file,
        source_row
      ) VALUES (@accountId, @postedDate, @description, @amountCents, @amountText, @source, @sourceFile, @sourceRow)`,
  );

  let inserted = 0;
  let skipped = 0;
  const touchedAccounts = new Set<string>();

  const transaction = db.transaction(() => {
    normalizedRows.forEach((row) => {
      upsertAccount.run({ id: row.accountId, source: row.source });
      touchedAccounts.add(row.accountId);
      const result = insertTransaction.run({
        accountId: row.accountId,
        postedDate: row.postedDate,
        description: row.description,
        amountCents: row.amountCents,
        amountText: row.amountText,
        source: row.source,
        sourceFile: displayName,
        sourceRow: row.rowNumber,
      });
      if (result.changes > 0) {
        inserted += 1;
      } else {
        skipped += 1;
      }
    });
  });

  transaction();

  return {
    file: displayName,
    absolutePath,
    inserted,
    skipped,
    accountsTouched: touchedAccounts.size,
  };
}

function normalizeRow(
  row: Record<string, string>,
  rowNumber: number,
  fileLabel: string,
): NormalizedRow {
  const accountId = requireField(row, 'account_id', rowNumber, fileLabel);
  const source = requireField(row, 'source', rowNumber, fileLabel);
  const description = requireField(row, 'description', rowNumber, fileLabel);
  const date = requireField(row, 'date', rowNumber, fileLabel);
  const amount = requireField(row, 'amount', rowNumber, fileLabel);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      `Row ${rowNumber} in ${fileLabel}: date must use YYYY-MM-DD format (received "${date}")`,
    );
  }

  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Row ${rowNumber} in ${fileLabel}: invalid calendar date "${date}"`);
  }

  const { amountCents, normalizedText } = normalizeAmount(amount, rowNumber, fileLabel);

  return {
    accountId,
    source,
    postedDate: date,
    description,
    amountCents,
    amountText: normalizedText,
    rowNumber,
  };
}

function normalizeAmount(value: string, rowNumber: number, fileLabel: string) {
  const sanitized = value.replace(/,/g, '').trim();
  if (!sanitized) {
    throw new Error(`Row ${rowNumber} in ${fileLabel}: amount must not be empty`);
  }
  const numeric = Number.parseFloat(sanitized);
  if (!Number.isFinite(numeric)) {
    throw new Error(`Row ${rowNumber} in ${fileLabel}: amount "${value}" is not numeric`);
  }
  const amountCents = Math.round(numeric * 100);
  const normalizedText = (amountCents / 100).toFixed(2);
  return { amountCents, normalizedText };
}

function requireField(
  row: Record<string, string>,
  fieldName: string,
  rowNumber: number,
  fileLabel: string,
): string {
  const raw = row[fieldName];
  if (typeof raw !== 'string') {
    throw new Error(`Row ${rowNumber} in ${fileLabel}: missing ${fieldName}`);
  }
  const value = raw.trim();
  if (!value) {
    throw new Error(`Row ${rowNumber} in ${fileLabel}: field ${fieldName} is required`);
  }
  return value;
}

function resolveFilePath(inputPath: string, dataDir: string): string {
  if (!inputPath) {
    throw new Error('CSV path must not be empty');
  }

  const expanded = expandHome(inputPath);
  const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(dataDir, expanded);
  if (!fs.existsSync(absolute)) {
    throw new Error(`CSV file not found: ${absolute}`);
  }
  if (!fs.statSync(absolute).isFile()) {
    throw new Error(`CSV path is not a file: ${absolute}`);
  }
  return absolute;
}

function expandHome(p: string): string {
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
