import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const runner = resolve(repositoryRoot, 'scripts/qa/run-sql-local.sh');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A stand-in CLI that logs every invocation and keeps one piece of state: whether
// the qa-sql-local stack exists (a marker file). `start` creates it, `stack
// destroy` removes it, and `stack list` prints the JSON shape CLI 2.121.0
// prints. Lets the test watch exactly what the runner asks the CLI to do
// without starting a real stack. `start` also records the ports it received in
// a separate file, so `calls` stays a pure list of CLI invocations.
interface FakeCli {
  version?: string;
  leftoverStack?: boolean;
  failStart?: boolean;
  destroyFails?: boolean;
  listGarbage?: boolean;
  env?: Record<string, string>;
}

function runWithFakeCli(options: FakeCli = {}) {
  const { version = '2.121.0', leftoverStack, failStart, destroyFails, listGarbage, env } = options;
  const dir = mkdtempSync(join(tmpdir(), 'sql-local-'));
  tempDirs.push(dir);
  const log = join(dir, 'calls.log');
  const marker = join(dir, 'stack-up');
  const portsLog = join(dir, 'ports.log');
  if (leftoverStack) writeFileSync(marker, '');
  const entry = JSON.stringify({
    id: '74352c92bd39',
    project_root: repositoryRoot,
    name: 'qa-sql-local',
    branch_context: 'refs/heads/test',
    runtime: 'native',
    owner: 'reachable',
  });
  const bin = join(dir, 'supabase');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> '${log}'`,
      `if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`,
      'if [ "$1 $2" = "stack list" ]; then',
      listGarbage ? "  echo 'not json'; exit 0" : '  :',
      `  if [ -e '${marker}' ]; then echo '{"stacks":[${entry}],"message":""}';`,
      `  else echo '{"stacks":[],"message":""}'; fi; exit 0`,
      'fi',
      'if [ "$1 $2" = "stack destroy" ]; then',
      destroyFails ? '  echo boom >&2; exit 1' : '  :',
      `  rm -f '${marker}'; exit 0`,
      'fi',
      `if [ "$1" = start ]; then`,
      `  echo "db=$SUPABASE_DB_PORT api=$SUPABASE_API_PORT" > '${portsLog}'`,
      `  touch '${marker}'; ${failStart ? 'exit 7' : 'exit 0'}`,
      'fi',
      'exit 0',
      '',
    ].join('\n')
  );
  chmodSync(bin, 0o755);
  const result = spawnSync('bash', [runner], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_DB_PORT: '',
      SUPABASE_API_PORT: '',
      ...env,
      SUPABASE_BIN: bin,
    },
  });
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  const started = calls.some(call => call.startsWith('start'));
  const ports = existsSync(portsLog) ? readFileSync(portsLog, 'utf8').trim() : undefined;
  return { ...result, calls, started, stackLeft: existsSync(marker), ports };
}

describe('run-sql-local.sh', () => {
  it('refuses a CLI older than 2.121.0 before starting anything', () => {
    const result = runWithFakeCli({ version: '2.117.0' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('2.117.0 is too old');
    expect(result.stderr).toContain('>= 2.121.0');
    expect(result.calls).toEqual(['--version']);
  });

  it('compares versions numerically, not as strings', () => {
    const result = runWithFakeCli({ version: '2.99.0' });
    expect(result.status).toBe(1);
    expect(result.calls).toEqual(['--version']);
  });

  // Every case below fails `start` (or stops before it), so the run never
  // reaches the real SQL test scripts.
  it('starts a fresh dedicated stack and destroys it when a step fails', () => {
    const result = runWithFakeCli({ failStart: true });
    expect(result.status).toBe(7);
    expect(result.calls).toContainEqual(
      expect.stringMatching(/^start --workdir .+ --stack qa-sql-local --runtime native --exclude /)
    );
    expect(result.calls.at(-1)).toMatch(/^stack destroy --workdir .+ --stack qa-sql-local --yes$/);
    expect(result.stackLeft).toBe(false);
  });

  // A worktree's default stack may hold someone's development data; only the
  // named qa-sql-local stack is ever started or destroyed.
  it('never touches the default project stack', () => {
    const { calls } = runWithFakeCli({ leftoverStack: true, failStart: true });
    for (const call of calls.filter(c => /^(start|stack destroy)/.test(c))) {
      expect(call).toMatch(/--stack qa-sql-local/);
    }
  });

  it('removes a leftover stack before starting, so the schema is rebuilt', () => {
    const { calls } = runWithFakeCli({ leftoverStack: true, failStart: true });
    const destroyAt = calls.findIndex(c => c.startsWith('stack destroy'));
    const startAt = calls.findIndex(c => c.startsWith('start'));
    expect(destroyAt).toBeGreaterThan(-1);
    expect(destroyAt).toBeLessThan(startAt);
  });

  // A surviving leftover would be resumed with its old schema and could PASS
  // without the migrations ever being rebuilt.
  it('aborts before start when a leftover stack cannot be removed', () => {
    const result = runWithFakeCli({ leftoverStack: true, destroyFails: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not remove a leftover 'qa-sql-local' stack");
    expect(result.started).toBe(false);
  });

  it('aborts before start when the stack list cannot be read', () => {
    const result = runWithFakeCli({ listGarbage: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('could not read');
    expect(result.started).toBe(false);
  });

  it('fails the run when the teardown destroy fails', () => {
    const result = runWithFakeCli({ failStart: true, destroyFails: true });
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('stack destroy failed');
  });

  it('never targets the linked project', () => {
    const { calls } = runWithFakeCli({ leftoverStack: true, failStart: true });
    for (const call of calls) {
      expect(call).not.toMatch(/--linked|\bpush\b|--db-url|--project-ref/);
    }
  });

  // Two worktrees must not share a port pair, or the second `start` fails.
  it('derives a stable per-worktree port pair outside config.toml ports', () => {
    const first = runWithFakeCli({ failStart: true }).ports;
    const second = runWithFakeCli({ failStart: true }).ports;
    expect(first).toBe(second);
    const [, db, api] = first?.match(/^db=(\d+) api=(\d+)$/) ?? [];
    expect(Number(db)).toBe(Number(api) + 1);
    expect(Number(api)).toBeGreaterThanOrEqual(40000);
    expect(Number(db)).toBeLessThanOrEqual(41999);
  });

  it('honours SUPABASE_DB_PORT and defaults the api port beside it', () => {
    const { ports } = runWithFakeCli({ failStart: true, env: { SUPABASE_DB_PORT: '45001' } });
    expect(ports).toBe('db=45001 api=45000');
  });

  it('honours an api-only SUPABASE_API_PORT and puts the db port beside it', () => {
    const { ports } = runWithFakeCli({ failStart: true, env: { SUPABASE_API_PORT: '45000' } });
    expect(ports).toBe('db=45001 api=45000');
  });

  it('refuses an api-only port whose db neighbour is out of range', () => {
    const result = runWithFakeCli({ env: { SUPABASE_API_PORT: '65535' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must be two different usable ports');
    expect(result.started).toBe(false);
  });

  it('refuses an unusable port before calling the CLI beyond --version', () => {
    const result = runWithFakeCli({ env: { SUPABASE_DB_PORT: '5432x' } });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("'5432x' is not a usable port");
    expect(result.calls).toEqual(['--version']);
  });
});
