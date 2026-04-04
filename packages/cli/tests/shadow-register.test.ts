import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { importCsvFiles, openShadowRegister } from '../src/shadow-register/importer';

describe('shadow register importer', () => {
  let tempDir: string;
  let dataDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'finazzle-shadow-'));
    dataDir = path.join(tempDir, 'data');
    fs.mkdirSync(dataDir, { recursive: true });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('ingests CSV rows into SQLite', () => {
    const csvPath = path.join(dataDir, 'checking.csv');
    const csv = [
      'date,description,amount,account_id,source',
      '2024-01-02,Payroll,2800.50,checking_main,boa_checking',
      '2024-01-03,Rent,-1900.00,checking_main,boa_checking',
    ].join('\n');
    fs.writeFileSync(csvPath, csv);

    const { db, dbPath } = openShadowRegister({ dataDir, dbFile: 'shadow.db' });

    const [summary] = importCsvFiles(db, ['checking.csv'], { dataDir });
    expect(summary.inserted).toBe(2);
    expect(summary.skipped).toBe(0);
    expect(summary.accountsTouched).toBe(1);

    const txCount = db.prepare('SELECT COUNT(*) AS count FROM transactions').get() as {
      count: number;
    };
    expect(txCount.count).toBe(2);

    const accountRow = db.prepare('SELECT id, source FROM accounts').get() as {
      id: string;
      source: string;
    };
    expect(accountRow).toEqual({ id: 'checking_main', source: 'boa_checking' });

    db.close();
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  test('skips duplicates on re-import', () => {
    const csvPath = path.join(dataDir, 'credit.csv');
    const csv = [
      'date,description,amount,account_id,source',
      '2024-02-01,Payment,-300.00,credit_blue,amex_blue',
    ].join('\n');
    fs.writeFileSync(csvPath, csv);

    const { db } = openShadowRegister({ dataDir });
    importCsvFiles(db, [csvPath], { dataDir });
    const [second] = importCsvFiles(db, [path.relative(dataDir, csvPath)], { dataDir });
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
    db.close();
  });

  test('throws when required fields are missing', () => {
    const csvPath = path.join(dataDir, 'bad.csv');
    const csv = ['date,description,amount,account_id,source', ',Missing amount,,acct,src'].join('\n');
    fs.writeFileSync(csvPath, csv);

    const { db } = openShadowRegister({ dataDir });
    expect(() => importCsvFiles(db, [csvPath], { dataDir })).toThrow(/Row 2/);
    db.close();
  });
});
