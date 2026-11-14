import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseGateComments } from './review-gate';

/**
 * MYK9-1967: the poster must never publish a non-hex range. A ref name used to
 * be cut to `origin/ma`, posted, and silently ignored by review-gate.ts. These
 * cases run the real script against a throwaway git repo and a stub `gh`.
 */
const SCRIPT = resolve(import.meta.dirname, 'post-review-gate.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

/** A repo with two commits, a branch `feature` on the second and `base-ref` on the first. */
function repo(): { dir: string; first: string; second: string } {
  const dir = tmp('refs-repo-');
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'a@example.com');
  git(dir, 'config', 'user.name', 'a');
  git(dir, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'first');
  const first = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'branch', 'base-ref');
  writeFileSync(join(dir, 'a.txt'), 'b\n');
  git(dir, 'commit', '-q', '-am', 'second');
  const second = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'branch', 'feature');
  return { dir, first, second };
}

function post(
  cwd: string,
  base: string,
  head: string
): { code: number; out: string; calls: string } {
  const gh = tmp('gh-stub-');
  const calls = join(gh, 'calls.log');
  const bin = join(gh, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '---\\n' >> '${calls}'\n`
  );
  chmodSync(bin, 0o755);
  const log = join(tmp('review-log-'), 'review.log');
  writeFileSync(log, 'codex\nNo actionable defects found.\n');
  let code = 0;
  let out = '';
  try {
    out = execFileSync('bash', [SCRIPT, '42', 'codex', base, head, 'no findings', log], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, GH_BIN: bin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    code = err.status;
    out = `${err.stdout}${err.stderr}`;
  }
  let posted = '';
  try {
    posted = readFileSync(calls, 'utf8');
  } catch {
    // gh was never called: nothing posted
  }
  return { code, out, calls: posted };
}

function postedBody(calls: string): string {
  return calls.split('--body\n')[1]!.split('\n---')[0]!;
}

describe('post-review-gate.sh resolves or refuses its range (MYK9-1967)', () => {
  it('resolves ref names to full SHAs, so the posted line parses', () => {
    const { dir, first, second } = repo();
    const r = post(dir, 'base-ref', 'feature');
    expect(r.code).toBe(0);
    const body = postedBody(r.calls);
    expect(body.split('\n')[0]).toBe(
      `Review gate: codex reviewed ${first.slice(0, 9)}..${second.slice(0, 9)} — no findings`
    );
    const parsed = parseGateComments([
      { body, createdAt: '2026-11-14T00:00:00Z', authorAssociation: 'OWNER' },
    ]);
    expect(parsed).toHaveLength(1);
  });

  it('refuses a ref that does not resolve, one line, nothing posted', () => {
    const { dir, second } = repo();
    const r = post(dir, 'origin/main', second);
    expect(r.code).toBe(2);
    expect(r.calls).toBe('');
    expect(r.out).toContain("base 'origin/main' is not a commit sha");
    expect(r.out.trim().split('\n')).toHaveLength(1);
  });

  it('refuses an unresolvable head the same way', () => {
    const { dir, first } = repo();
    const r = post(dir, first, 'no-such-branch');
    expect(r.code).toBe(2);
    expect(r.calls).toBe('');
    expect(r.out).toContain("head 'no-such-branch' is not a commit sha");
  });

  it('passes a hex SHA through unchanged, even one this repo does not have', () => {
    const { dir } = repo();
    const r = post(dir, '0a2020c7a', '5af9af158');
    expect(r.code).toBe(0);
    expect(postedBody(r.calls).split('\n')[0]).toBe(
      'Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings'
    );
  });

  it('passes a full 40-character SHA through unchanged', () => {
    const { dir, first, second } = repo();
    const r = post(dir, first, second);
    expect(r.code).toBe(0);
    expect(postedBody(r.calls).split('\n')[0]).toBe(
      `Review gate: codex reviewed ${first.slice(0, 9)}..${second.slice(0, 9)} — no findings`
    );
  });
});
