import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('load Playwright discovery', () => {
  it('keeps request attribution opt-in, write-guarded and separate from load', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/test/e2e/load-request-phases.spec.ts'),
      'utf8'
    );
    expect(source).toContain("process.env.LOAD_READINESS_DIAGNOSTIC !== 'true'");
    expect(source).toContain("serviceWorkers: 'block'");
    expect(source).toContain('strictRpcWrites: true');
    expect(source.indexOf('await installSharedStagingWriteGuard')).toBeLessThan(
      source.indexOf('signInAsSecretary(page')
    );
    expect(source).toContain("event.request.method === 'OPTIONS'");
    expect(source).not.toContain('submitScore');
  });
  it('guards readiness navigation writes without mocking the real G9 mutation workload', () => {
    const readiness = readFileSync(
      resolve(process.cwd(), 'src/test/e2e/load-readiness.spec.ts'),
      'utf8'
    );
    expect(readiness).toContain("serviceWorkers: 'block'");
    expect(readiness).toContain('strictRpcWrites: true');
    expect(readiness.indexOf('await installSharedStagingWriteGuard')).toBeLessThan(
      readiness.indexOf('await signInAs')
    );
    const runner = readFileSync(resolve(__dirname, 'loadBrowserRunner.ts'), 'utf8');
    expect(runner).not.toContain('installSharedStagingWriteGuard');
    // Preview serves the real PWA, so every context the G9 runner opens must block
    // service workers or it precaches the 41 MB manifest during measurement. Counted
    // rather than merely present: the regression is adding it to one call, not both.
    expect(runner.match(/serviceWorkers: 'block'/g)).toHaveLength(
      (runner.match(/browser\.newContext\(/g) ?? []).length
    );
    expect(runner.indexOf('generatorSampler.markLoadStarted()')).toBeLessThan(
      runner.indexOf('const sessionResults =')
    );
    expect(runner.indexOf('await generatorSampler.stop()')).toBeLessThan(
      runner.indexOf('await countPersistedScores')
    );
  });
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
