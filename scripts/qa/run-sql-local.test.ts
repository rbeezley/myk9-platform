import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// Same, with extra environment. The stub records the ports `start` receives in
// a separate file, so `calls` stays a pure list of CLI invocations.
function runWithFakeCliEnv(env: Record<string, string>, version: string, ...failOn: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'sql-local-'));
  tempDirs.push(dir);
  const log = join(dir, 'calls.log');
  const portsLog = join(dir, 'ports.log');
  const bin = join(dir, 'supabase');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> '${log}'`,
      `if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`,
      `if [ "$1" = "start" ]; then echo "db=$SUPABASE_DB_PORT api=$SUPABASE_API_PORT" > '${portsLog}'; fi`,
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
  const ports = existsSync(portsLog) ? readFileSync(portsLog, 'utf8').trim() : undefined;
  return { ...result, calls, ports };
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

  it('rebuilds a fresh dedicated stack and destroys it when a step fails', () => {
    const result = runWithFakeCli('2.121.0', 'start');
    expect(result.status).toBe(7);
    expect(result.calls[1]).toMatch(/^stack destroy --workdir .+ --stack qa-sql-local --yes$/);
    expect(result.calls[2]).toMatch(
      /^start --workdir .+ --stack qa-sql-local --runtime native --exclude /
    );
    expect(result.calls.at(-1)).toBe(result.calls[1]);
  });

  // A worktree's default stack may hold someone's development data; only the
  // named qa-sql-local stack is ever started, reset or destroyed.
  it('never touches the default project stack', () => {
    const { calls } = runWithFakeCli('2.121.0', 'start');
    for (const call of calls.slice(1)) {
      expect(call).toMatch(/--stack qa-sql-local/);
    }
  });

  it('fails the run when the stack cannot be destroyed', () => {
    // `start` fails too, so the run stops before the real SQL test scripts.
    const result = runWithFakeCli('2.121.0', 'stack', 'start');
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('stack destroy failed');
  });

  it('never targets the linked project', () => {
    const { calls } = runWithFakeCli('2.121.0', 'start');
    for (const call of calls) {
      expect(call).not.toMatch(/--linked|\bpush\b|--db-url|--project-ref/);
    }
  });

  // Two worktrees must not share a port pair, or the second `start` fails.
  it('derives a stable per-worktree port pair outside config.toml ports', () => {
    const first = runWithFakeCli('2.121.0', 'start').ports;
    const second = runWithFakeCli('2.121.0', 'start').ports;
    expect(first).toBe(second);
    const [, db, api] = first?.match(/^db=(\d+) api=(\d+)$/) ?? [];
    expect(Number(db)).toBe(Number(api) + 1);
    expect(Number(api)).toBeGreaterThanOrEqual(40000);
    expect(Number(db)).toBeLessThanOrEqual(41999);
  });

  it('honours SUPABASE_DB_PORT and defaults the api port beside it', () => {
    const { ports } = runWithFakeCliEnv({ SUPABASE_DB_PORT: '45001' }, '2.121.0', 'start');
    expect(ports).toBe('db=45001 api=45000');
  });

  it('refuses an unusable port before starting a stack', () => {
    const result = runWithFakeCliEnv({ SUPABASE_DB_PORT: '5432x' }, '2.121.0');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'5432x' is not a usable port");
    expect(result.calls).toEqual(['--version']);
  });
});
