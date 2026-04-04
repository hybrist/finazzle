#!/usr/bin/env node
import { Command } from 'commander';
import { buildBanner } from './banner';
import { registerShadowCommands } from './shadow-register/commands';

const program = new Command();

program
  .name('finazzle')
  .description('Bootstrap CLI for the Finazzle local-first cash flow toolkit')
  .version('0.1.0');

program
  .option('--plain', 'Render the banner without ANSI colors', false)
  .action((options: { plain?: boolean }) => {
    const banner = buildBanner({ monochrome: Boolean(options.plain) });
    // eslint-disable-next-line no-console
    console.log(banner);
  });

registerShadowCommands(program);

program.showHelpAfterError('(run with --help for usage info)');

program
  .parseAsync()
  .catch((error) => {
    if (error instanceof Error) {
      // eslint-disable-next-line no-console
      console.error(error.message);
    }
    process.exitCode = 1;
  });
