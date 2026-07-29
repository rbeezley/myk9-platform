import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('load Playwright discovery', () => {
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
