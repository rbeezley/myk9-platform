import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const runner = resolve(import.meta.dirname, 'run-sql-local.sh');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A stand-in CLI that logs every invocation, reports `version`, and fails any
// subcommand named in `failOn` with exit 7. Lets the test watch exactly what the runner
// asks the CLI to do without starting a real stack.
function runWithFakeCli(version: string, ...failOn: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'sql-local-'));
  tempDirs.push(dir);
  const log = join(dir, 'calls.log');
  const bin = join(dir, 'supabase');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> '${log}'`,
      `if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`,
      ...failOn.map(cmd => `if [ "$1" = '${cmd}' ]; then exit 7; fi`),
      'exit 0',
      '',
    ].join('\n')
  );
  chmodSync(bin, 0o755);
  const result = spawnSync('bash', [runner], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_BIN: bin },
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  return { ...result, calls };
}

describe('run-sql-local.sh', () => {
  it('refuses a CLI older than 2.121.0 before starting anything', () => {
    const result = runWithFakeCli('2.117.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('2.117.0 is too old');
    expect(result.stderr).toContain('>= 2.121.0');
    expect(result.calls).toEqual(['--version']);
  });

  it('compares versions numerically, not as strings', () => {
    const result = runWithFakeCli('2.99.0');
    expect(result.status).toBe(1);
    expect(result.calls).toEqual(['--version']);
  });

  it('destroys the stack when a step fails and keeps the failing exit code', () => {
    const result = runWithFakeCli('2.121.0', 'db');
    expect(result.status).toBe(7);
    expect(result.calls[1]).toMatch(/^start --workdir .+ --runtime native --exclude /);
    expect(result.calls[2]).toMatch(/^db reset --workdir .+ --local --no-seed$/);
    expect(result.calls.at(-1)).toMatch(/^stack destroy --workdir .+ --yes$/);
  });

  it('fails the run when the stack cannot be destroyed', () => {
    // `db` fails too, so the run stops before the real SQL test scripts.
    const result = runWithFakeCli('2.121.0', 'stack', 'db');
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('stack destroy failed');
  });

  it('never targets the linked project', () => {
    const { calls } = runWithFakeCli('2.121.0', 'db');
    for (const call of calls) {
      expect(call).not.toMatch(/--linked|\bpush\b|--db-url|--project-ref/);
    }
  });
});
