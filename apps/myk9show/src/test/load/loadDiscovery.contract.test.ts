import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('load Playwright discovery', () => {
  it('budgets for the longest synchronized start window and full scenario', () => {
    const config = readFileSync(resolve(process.cwd(), 'playwright.load.config.ts'), 'utf8');

    expect(config).toContain('timeout: 50 * 60 * 1_000');
  });

  it('discovers a non-zero suite containing the Normal show-day gate', () => {
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config=playwright.load.config.ts',
        '--list',
        '--grep',
        'G9 Normal show-day load',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          LOAD_TEST_MODE: 'discovery',
        },
      }
    );

    const output = `${result.stdout}\n${result.stderr}`;
    expect(result.status, output).toBe(0);
    expect(output).toContain('G9 Normal show-day load');
    expect(output).toMatch(/Total:\s+[1-9]\d*\s+test/);
  });
});
