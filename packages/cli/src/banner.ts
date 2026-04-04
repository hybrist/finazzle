import chalk from 'chalk';

export type BannerOptions = {
  monochrome?: boolean;
};

type Colorizer = (input: string) => string;

const passthrough: Colorizer = (value) => value;

const colorize = (useColor: boolean, color: Colorizer): Colorizer =>
  useColor ? color : passthrough;

export const buildBanner = (options: BannerOptions = {}): string => {
  const useColor = !options.monochrome;
  const headline = colorize(useColor, chalk.cyanBright);
  const accent = colorize(useColor, chalk.magentaBright);
  const muted = colorize(useColor, chalk.gray);

  const lines = [
    accent('╔══════════════════════════════════════════════╗'),
    accent('║                                              ║'),
    headline('║               Finazzle CLI                   ║'),
    muted('║      Local-first cash flow scaffolding       ║'),
    accent('╠══════════════════════════════════════════════╣'),
    muted('║ Placeholder banner until ingestion lands.    ║'),
    muted('║                                              ║'),
    muted('║  • Phase 1: Normalize ledgers                ║'),
    muted('║  • Phase 2: Suppress transfer noise          ║'),
    muted('║  • Phase 3: Review liabilities with intent   ║'),
    accent('╠══════════════════════════════════════════════╣'),
    muted('║ Try `finazzle --help` to see available flags ║'),
    accent('║    and watch this space for ingestion tools. ║'),
    accent('╚══════════════════════════════════════════════╝')
  ];

  return lines.join('\n');
};
