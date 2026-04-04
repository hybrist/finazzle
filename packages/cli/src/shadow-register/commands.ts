import { Command } from 'commander';
import { importCsvFiles, openShadowRegister, ShadowRegisterConfig, ImportSummary } from './importer';
import { matchTransfers, MatchSummary } from './matcher';

interface ImportOptions extends ShadowRegisterConfig {
  silent?: boolean;
}

interface MatchOptions extends ShadowRegisterConfig {
  sampleSize?: number;
}

export function registerShadowCommands(program: Command) {
  const shadow = program
    .command('shadow')
    .description('Manage the local Shadow Register database');

  shadow
    .command('import')
    .argument('<csv...>', 'CSV files to ingest (relative to the data directory by default)')
    .option('--data-dir <path>', 'Override the data directory root')
    .option('--db-file <filename>', 'Override the SQLite filename within the data dir')
    .option('--silent', 'Suppress verbose progress logs', false)
    .action((csv: string[], options: ImportOptions) => {
      const { db, dataDir, dbPath } = openShadowRegister(options);
      try {
        const summaries = importCsvFiles(db, csv, { dataDir });
        if (!options.silent) {
          printShadowSummary({ summaries, dataDir, dbPath });
        }
      } finally {
        db.close();
      }
    });

  shadow
    .command('match')
    .description('Match cross-account transfers and hide them from the register')
    .option('--data-dir <path>', 'Override the data directory root')
    .option('--db-file <filename>', 'Override the SQLite filename within the data dir')
    .option(
      '--sample-size <count>',
      'How many sample matches to display in the report',
      parseSampleSize,
      5,
    )
    .action((options: MatchOptions) => {
      const { db, dbPath } = openShadowRegister(options);
      try {
        const summary = matchTransfers(db, { sampleLimit: options.sampleSize });
        printMatchReport(summary, { dbPath, sampleLimit: options.sampleSize ?? 5 });
      } finally {
        db.close();
      }
    });
}

function printShadowSummary(details: {
  summaries: ImportSummary[];
  dataDir: string;
  dbPath: string;
}) {
  const imported = details.summaries.reduce(
    (acc, summary) => {
      acc.inserted += summary.inserted;
      acc.skipped += summary.skipped;
      acc.files.push(`${summary.file} (+${summary.inserted}/~${summary.skipped})`);
      return acc;
    },
    { inserted: 0, skipped: 0, files: [] as string[] },
  );

  // eslint-disable-next-line no-console
  console.log(`Shadow Register database: ${details.dbPath}`);
  // eslint-disable-next-line no-console
  console.log(`Data directory: ${details.dataDir}`);
  imported.files.forEach((fileLabel) => {
    // eslint-disable-next-line no-console
    console.log(` • ${fileLabel}`);
  });
  // eslint-disable-next-line no-console
  console.log(
    `Inserted ${imported.inserted} new transactions (${imported.skipped} already in the database)`,
  );
}

function parseSampleSize(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('sample-size must be a positive integer');
  }
  return parsed;
}

function printMatchReport(summary: MatchSummary, context: { dbPath: string; sampleLimit: number }) {
  const { dbPath, sampleLimit } = context;
  // eslint-disable-next-line no-console
  console.log(`Shadow Register database: ${dbPath}`);
  if (summary.pairsMatched === 0) {
    // eslint-disable-next-line no-console
    console.log('No transfer pairs met the ±3 day & 0 variance criteria.');
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `Matched ${summary.pairsMatched} transfer pairs (${summary.transactionsHidden} transactions hidden).`,
  );
  // eslint-disable-next-line no-console
  console.log(`Displaying up to ${sampleLimit} sample pairs:`);
  summary.sample.forEach((pair, index) => {
    const line =
      `${index + 1}. ${pair.debit.accountId} ${pair.debit.postedDate} ${pair.debit.description} (${pair.debit.amount})` +
      ` ↔ ${pair.credit.accountId} ${pair.credit.postedDate} ${pair.credit.description} (${pair.credit.amount})` +
      ` · Δ${pair.dayDelta} day${pair.dayDelta === 1 ? '' : 's'}`;
    // eslint-disable-next-line no-console
    console.log(line);
  });
}
