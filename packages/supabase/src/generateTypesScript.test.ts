import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
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

  it('runs the default wrapper from a checkout path containing a space', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'gen-types-')), 'AI Projects', 'repo');
    mkdirSync(join(root, 'packages', 'supabase', 'scripts'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    copyFileSync(SCRIPT, join(root, 'packages', 'supabase', 'scripts', 'generate-types.sh'));
    copyFileSync(
      join(__dirname, '..', '..', '..', 'scripts', 'supabase.sh'),
      join(root, 'scripts', 'supabase.sh')
    );
    const bin = join(root, 'apps', 'myk9show', 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, 'supabase'),
      '#!/usr/bin/env bash\n[ "$1" = --version ] && echo 3.2.0 && exit 0\necho "ARGS $*"\n'
    );
    chmodSync(join(bin, 'supabase'), 0o755);
    const out = join(root, 'out.ts');
    writeFileSync(out, 'COMMITTED');
    const res = spawnSync(
      'bash',
      [join(root, 'packages', 'supabase', 'scripts', 'generate-types.sh')],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          HOME: tmpdir(),
          SUPABASE_PROJECT_ID: 'ref123',
          MYK9_TYPES_OUT: out,
        },
      }
    );
    expect(res.stderr).toBe('');
    expect(res.status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe('ARGS gen types typescript --remote=ref123\n');
  });

  it('is valid bash', () => {
    expect(() => execFileSync('bash', ['-n', SCRIPT])).not.toThrow();
  });
});
