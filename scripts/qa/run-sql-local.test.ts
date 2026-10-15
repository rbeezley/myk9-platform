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
// without starting a real stack.
interface FakeCli {
  version?: string;
  leftoverStack?: boolean;
  failStart?: boolean;
  destroyFails?: boolean;
  listGarbage?: boolean;
}

function runWithFakeCli(options: FakeCli = {}) {
  const { version = '2.121.0', leftoverStack, failStart, destroyFails, listGarbage } = options;
  const dir = mkdtempSync(join(tmpdir(), 'sql-local-'));
  tempDirs.push(dir);
  const log = join(dir, 'calls.log');
  const marker = join(dir, 'stack-up');
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
      `if [ "$1" = start ]; then touch '${marker}'; ${failStart ? 'exit 7' : 'exit 0'}; fi`,
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
  const started = calls.some(call => call.startsWith('start'));
  return { ...result, calls, started, stackLeft: existsSync(marker) };
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
});
