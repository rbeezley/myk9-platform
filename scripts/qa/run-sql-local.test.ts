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

// A stand-in CLI that logs every invocation to $CALLS, reports `version`, then
// runs each `rules` line (bash) before exiting 0. Lets the test watch exactly
// what the runner asks the CLI to do without starting a real stack.
const failStart = '[ "$1" = start ] && exit 7';
const destroyFindsNothing =
  '[ "$1" = stack ] && { echo \'No managed stack named "qa-sql-local" was found\'; exit 1; }';
const destroyErrors = '[ "$1" = stack ] && { echo boom >&2; exit 1; }';
// The first destroy (the leftover sweep) finds nothing; the teardown one errors.
const onlyTeardownDestroyErrors =
  '[ "$1" = stack ] && [ "$(grep -c "^stack" "$CALLS")" = 2 ] && { echo boom >&2; exit 1; }';

function runWithFakeCli(version: string, rules: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'sql-local-'));
  tempDirs.push(dir);
  const log = join(dir, 'calls.log');
  const bin = join(dir, 'supabase');
  writeFileSync(
    bin,
    [
      '#!/usr/bin/env bash',
      `CALLS='${log}'`,
      'echo "$*" >> "$CALLS"',
      `if [ "$1" = "--version" ]; then echo '${version}'; exit 0; fi`,
      ...rules,
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

  it('rebuilds a fresh dedicated stack and destroys it when a step fails', () => {
    const result = runWithFakeCli('2.121.0', [failStart]);
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
    const { calls } = runWithFakeCli('2.121.0', [failStart]);
    for (const call of calls.slice(1)) {
      expect(call).toMatch(/--stack qa-sql-local/);
    }
  });

  it('treats an absent leftover stack as clean', () => {
    const result = runWithFakeCli('2.121.0', [destroyFindsNothing, failStart]);
    expect(result.status).toBe(7);
    expect(result.calls[2]).toMatch(/^start /);
    expect(result.stderr).not.toContain('stack destroy failed');
  });

  // A surviving leftover would be resumed with its old schema and could PASS
  // without the migrations ever being rebuilt.
  it('aborts before start when a leftover stack cannot be removed', () => {
    const result = runWithFakeCli('2.121.0', [destroyErrors]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("could not remove a leftover 'qa-sql-local' stack");
    expect(result.calls.some(call => call.startsWith('start'))).toBe(false);
  });

  it('fails the run when the teardown destroy fails', () => {
    // `start` fails too, so the run stops before the real SQL test scripts.
    const result = runWithFakeCli('2.121.0', [onlyTeardownDestroyErrors, failStart]);
    expect(result.status).toBe(7);
    expect(result.stderr).toContain('stack destroy failed');
  });

  it('never targets the linked project', () => {
    const { calls } = runWithFakeCli('2.121.0', [failStart]);
    for (const call of calls) {
      expect(call).not.toMatch(/--linked|\bpush\b|--db-url|--project-ref/);
    }
  });
});
