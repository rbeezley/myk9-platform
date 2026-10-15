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
  return runWithFakeCliEnv({}, version, ...failOn);
}

// Same, with extra environment; the stub logs the ports `start` receives.
function runWithFakeCliEnv(env: Record<string, string>, version: string, ...failOn: string[]) {
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
      `if [ "$1" = "start" ]; then echo "ports db=$SUPABASE_DB_PORT api=$SUPABASE_API_PORT" >> '${log}'; fi`,
      ...failOn.map(cmd => `if [ "$1" = '${cmd}' ]; then exit 7; fi`),
      'exit 0',
      '',
    ].join('\n')
  );
  chmodSync(bin, 0o755);
  const result = spawnSync('bash', [runner], {
    encoding: 'utf8',
    env: { ...process.env, SUPABASE_DB_PORT: '', SUPABASE_API_PORT: '', ...env, SUPABASE_BIN: bin },
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
    expect(result.calls[2]).toMatch(/^ports db=\d+ api=\d+$/);
    expect(result.calls[3]).toMatch(/^db reset --workdir .+ --local --no-seed$/);
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

  // Two worktrees must not share a port pair, or the second `start` fails.
  it('derives a stable per-worktree port pair outside config.toml ports', () => {
    const first = runWithFakeCli('2.121.0', 'db').calls[2];
    const second = runWithFakeCli('2.121.0', 'db').calls[2];
    expect(first).toBe(second);
    const [, db, api] = first.match(/^ports db=(\d+) api=(\d+)$/) ?? [];
    expect(Number(db)).toBe(Number(api) + 1);
    expect(Number(api)).toBeGreaterThanOrEqual(40000);
    expect(Number(db)).toBeLessThanOrEqual(41999);
  });

  it('honours SUPABASE_DB_PORT and defaults the api port beside it', () => {
    const { calls } = runWithFakeCliEnv({ SUPABASE_DB_PORT: '45001' }, '2.121.0', 'db');
    expect(calls[2]).toBe('ports db=45001 api=45000');
  });

  it('refuses an unusable port before starting a stack', () => {
    const result = runWithFakeCliEnv({ SUPABASE_DB_PORT: '5432x' }, '2.121.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'5432x' is not a usable port");
    expect(result.calls).toEqual(['--version']);
  });
});
