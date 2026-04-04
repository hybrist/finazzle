import { Command } from 'commander';
import { importCsvFiles, openShadowRegister, ShadowRegisterConfig, ImportSummary } from './importer';

interface ImportOptions extends ShadowRegisterConfig {
  silent?: boolean;
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
