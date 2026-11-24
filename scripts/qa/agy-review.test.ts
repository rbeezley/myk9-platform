import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * agy-review.sh is a program, so it gets a behavioural test (MYK9-2326): a
 * stub agy on PATH prints a canned answer and exits with a chosen code, a stub
 * gh records what reaches the PR, and we assert exit codes and posts. The real
 * agy exits 0 on a timeout, a refused command and an empty answer, so every
 * "did not run" case here runs with exit 0 on purpose.
 */
const SCRIPT = resolve(import.meta.dirname, 'agy-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** A throwaway repo with two commits, so BASE..HEAD is a real, non-empty diff. */
function makeRepo(): string {
  const dir = tmp('agy-repo-');
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 't',
    GIT_AUTHOR_EMAIL: 't@t',
    GIT_COMMITTER_NAME: 't',
    GIT_COMMITTER_EMAIL: 't@t',
  };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore', env });
  git('init', '-q', '-b', 'main');
  writeFileSync(join(dir, 'a.txt'), 'one\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  writeFileSync(join(dir, 'a.txt'), 'one\ntwo\n');
  git('commit', '-q', '-am', 'change');
  return dir;
}

function stubAgy(output: string, exitCode = 0) {
  const dir = tmp('agy-stub-');
  const bin = join(dir, 'agy');
  const canned = join(dir, 'canned.log');
  const args = join(dir, 'args.log');
  writeFileSync(canned, output);
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\0' "$@" > '${args}'
cat ${JSON.stringify(canned)}
exit ${exitCode}
`
  );
  chmodSync(bin, 0o755);
  return { bin, args, log: join(dir, 'review.log') };
}

function stubGh() {
  const dir = tmp('gh-stub-');
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> '${calls}'
printf -- '---\\n' >> '${calls}'
case "$*" in
  *comments*) exit 0 ;;
  'pr view --json number'*) echo 7 ;;
esac
`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}

function bodies(callsPath: string): string[] {
  if (!existsSync(callsPath)) return [];
  return readFileSync(callsPath, 'utf8')
    .split('\n---\n')
    .filter(Boolean)
    .flatMap(call => {
      const lines = call.split('\n');
      const i = lines.indexOf('--body');
      return i < 0 ? [] : [lines.slice(i + 1).join('\n')];
    });
}

function run(
  stub: { bin: string; log: string },
  args: string[] = ['HEAD~1'],
  gh?: { bin: string }
): { code: number; out: string; repo: string } {
  const repo = makeRepo();
  const env = {
    ...process.env,
    AGY_BIN: stub.bin,
    AGY_REVIEW_LOG: stub.log,
    ...(gh ? { GH_BIN: gh.bin } : {}),
  };
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      cwd: repo,
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out, repo };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}`, repo };
  }
}

const CLEAN = 'No actionable defects found.\n\n- Behavior changes: clean.\n\nEND OF REVIEW\n';

describe('agy-review.sh', () => {
  it('exits 0 and prints the exact evidence line on a clean verdict', () => {
    const r = run(stubAgy(CLEAN));
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Review gate: agy reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings$/m);
  });

  it('runs agy read-only: plan mode, the session allow list, flags before -p, no skip-permissions', () => {
    const stub = stubAgy(CLEAN);
    const r = run(stub);
    expect(r.code).toBe(0);
    const args = readFileSync(stub.args, 'utf8').split('\0').slice(0, -1);
    expect(args.slice(0, 2)).toEqual(['--mode', 'plan']);
    expect(args).not.toContain('--dangerously-skip-permissions');
    const settings = JSON.parse(args[args.indexOf('--settings') + 1] ?? '{}') as {
      permissions: { allow: string[] };
    };
    expect(settings.permissions.allow).toContain('command(grep)');
    expect(settings.permissions.allow.sort()).toEqual(
      ['grep', 'ls', 'cat', 'head', 'tail', 'wc'].map(c => `command(${c})`).sort()
    );
    expect(settings.permissions.allow).not.toContain('command(sed)');
    expect(settings.permissions.allow).not.toContain('command(sort)');
    expect(settings.permissions.allow).not.toContain('command(uniq)');
    // find -exec / -delete write, so find is not read-only.
    expect(settings.permissions.allow).not.toContain('command(find)');
    const p = args.indexOf('-p');
    expect(p).toBe(args.length - 2);
    const prompt = args[p + 1] ?? '';
    expect(prompt).toContain('This is a question, not a task');
    const sha = prompt.match(/agy-review-([0-9a-f]{9})\.diff/)?.[1];
    expect(sha).toBeDefined();
    expect(prompt).not.toContain('{DIFF}');
    expect(prompt).not.toContain('{NEWEST}');
    expect(prompt).toContain('No actionable defects found.');
    expect(prompt).toContain('The LAST line of your answer must be exactly: END OF REVIEW');
    expect(readFileSync(join(r.repo, '.logs', `agy-review-${sha}.diff`), 'utf8')).toContain('+two');
  });

  it('exits 1 with the findings when the review reports a [P*] item', () => {
    const r = run(stubAgy('- [P2] a.ts:1 something is wrong\n'));
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('Review gate: agy reviewed');
  });

  it.each([
    ['empty output', '', 0, 'empty output'],
    ['whitespace-only output', '\n  \n', 0, 'empty output'],
    [
      'a print timeout line',
      'Print timeout exceeded after 20m0s\n\nEND OF REVIEW\n',
      0,
      'timeout, refused command or error line',
    ],
    [
      'a refused command line',
      'Error: command denied: rg -n foo\n\nEND OF REVIEW\n',
      0,
      'timeout, refused command or error line',
    ],
    [
      'a refusal after a clean-looking opening',
      'No actionable defects found.\nError: command denied: git diff\n\nEND OF REVIEW\n',
      0,
      'timeout, refused command or error line',
    ],
    [
      'output cut inside a code block',
      'No actionable defects found.\n\n```ts\nconst a = 1;\n\nEND OF REVIEW\n',
      0,
      'truncated inside a code block',
    ],
    ['a clean verdict but cli exit 1', CLEAN, 1, 'cli exited 1'],
    [
      'a clean opening cut off mid-prose (no END OF REVIEW)',
      'No actionable defects found.\n\n- Behavior changes: clean, and the migration only add',
      0,
      'does not end with a line reading END OF REVIEW',
    ],
    [
      'a clean verdict whose END OF REVIEW is not the last line',
      'No actionable defects found.\n\nEND OF REVIEW\nand then one more thing',
      0,
      'does not end with a line reading END OF REVIEW',
    ],
    [
      'prose with no verdict',
      'I looked at the diff and it seems fine overall.\n\nEND OF REVIEW\n',
      0,
      'neither findings nor an explicit clean verdict',
    ],
    [
      'an incomplete review',
      'Unable to complete the review: the diff was too large.\n\nEND OF REVIEW\n',
      0,
      'incomplete review',
    ],
  ])('exits 2 and posts no evidence on %s', (_, output, exitCode, message) => {
    const gh = stubGh();
    const r = run(stubAgy(output, exitCode), ['HEAD~1', '--post'], gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain(message);
    expect(r.out).not.toContain('Review gate: agy reviewed');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('a completed clean review with column-0 prose that merely starts like an error is still clean', () => {
    const r = run(
      stubAgy(
        'No actionable defects found.\n\nError handling was checked and is clean.\nPermission checks are denied for anonymous callers, as intended.\nTimeout handling: fine.\n\nEND OF REVIEW\n'
      )
    );
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^Review gate: agy reviewed /m);
  });

  it('a findings review with such column-0 prose is still findings', () => {
    const r = run(
      stubAgy(
        '- [P2] a.ts:1 something is wrong\n\nError handling was checked.\nPermission checks are denied for anonymous callers.\n'
      )
    );
    expect(r.code).toBe(1);
  });

  it('a clean opening followed by an unable-to-complete statement is not clean, with or without --post', () => {
    const gh = stubGh();
    const text =
      'No actionable defects found.\n\nUnable to complete the review of the migrations.\n\nEND OF REVIEW\n';
    expect(run(stubAgy(text)).code).toBe(2);
    const r = run(stubAgy(text), ['HEAD~1', '--post'], gh);
    expect(r.code).toBe(2);
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('every command the prompt tells agy to use is on the allow list', () => {
    const prompt = readFileSync(resolve(import.meta.dirname, 'agy-review-prompt.md'), 'utf8');
    const line = prompt.split('\n').find(l => l.includes('Shell commands may only use')) ?? '';
    const told = [...line.split('You may combine')[0]!.matchAll(/`([a-z]+)`/g)].map(m => m[1]!);
    const script = readFileSync(SCRIPT, 'utf8');
    const allowed = [...script.matchAll(/command\((\w+)\)/g)].map(m => m[1]!);
    expect(told.length).toBeGreaterThan(3);
    for (const cmd of told) expect(allowed, `prompt names ${cmd}`).toContain(cmd);
  });

  it('the prior-findings count reads only trusted authors', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    const line = script.split('\n').find(l => l.includes('PRIOR="$(')) ?? '';
    expect(line).toContain('authorAssociation == "OWNER"');
  });

  it('exits 2 when the diff is empty (nothing was reviewed)', () => {
    const r = run(stubAgy(CLEAN), ['HEAD']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('nothing to review');
  });

  it('--post on a clean review posts agy evidence through the poster', () => {
    const gh = stubGh();
    const r = run(stubAgy(CLEAN), ['HEAD~1', '--post'], gh);
    expect(r.code).toBe(0);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(
      /^Review gate: agy reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings\n/
    );
    expect(posted[0]).toContain('No actionable defects found.');
  });

  it('--post on findings posts a NON-evidence comment, withdraws, and exits 1', () => {
    const gh = stubGh();
    const r = run(stubAgy('- [P2] a.ts:1 something is wrong\n'), ['HEAD~1', '--post'], gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted[0]).toMatch(/^Agy findings for [0-9a-f]{9} \(not gate evidence\):/);
    expect(posted[0]?.split('\n')[0]).not.toMatch(/^Review gate:/);
    expect(posted[1]?.split('\n')[0]).toMatch(
      /^Review gate: agy reviewed .* — 1 findings, not addressed$/
    );
  });

  it('without --post it writes nothing to the PR', () => {
    const gh = stubGh();
    expect(run(stubAgy(CLEAN), ['HEAD~1'], gh).code).toBe(0);
    expect(existsSync(gh.calls)).toBe(false);
  });
});
