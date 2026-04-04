import { describe, expect, it } from 'vitest';
import { buildBanner } from '../src/banner';

describe('buildBanner', () => {
  it('contains the CLI name', () => {
    const banner = buildBanner({ monochrome: true });
    expect(banner).toContain('Finazzle CLI');
  });

  it('renders multi-line ASCII art', () => {
    const banner = buildBanner({ monochrome: true });
    const lines = banner.split('\n');
    expect(lines.length).toBeGreaterThan(5);
    expect(lines[0]).toMatch(/^╔═/);
    expect(lines.at(-1)).toMatch(/╝$/);
  });
});
