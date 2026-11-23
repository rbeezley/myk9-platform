import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = join(__dirname, '..', 'scripts', 'generate-types.sh');

function setup(runnerBody: string) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-types-'));
  const out = join(dir, 'database.types.ts');
  writeFileSync(out, 'COMMITTED');
  const runner = join(dir, 'fake-supabase');
  writeFileSync(runner, `#!/usr/bin/env bash\n${runnerBody}\n`);
  chmodSync(runner, 0o755);
  const run = () =>
    spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SUPABASE_PROJECT_ID: 'ref123',
        MYK9_SUPABASE_RUNNER: runner,
        MYK9_TYPES_OUT: out,
      },
    });
  return { dir, out, run };
}

describe('generate-types.sh (MYK9-2335)', () => {
  it('leaves the committed file untouched when the CLI fails after printing', () => {
    const { dir, out, run } = setup('echo partial; exit 7');
    const res = run();
    expect(res.status).toBe(7);
    expect(readFileSync(out, 'utf8')).toBe('COMMITTED');
    expect(readdirSync(dir).sort()).toEqual(['database.types.ts', 'fake-supabase']);
  });

  it('replaces the file with the CLI output and passes --remote on success', () => {
    const { out, run } = setup('echo "ARGS $*"');
    expect(run().status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('ARGS gen types typescript --remote=ref123\n');
  });

  it('is valid bash', () => {
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow();
  });
});
