import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Round 2+ fix-range review and the likelihood cap (MYK9-1590). The wrapper
 * runs inside a throwaway git repo so ancestry is real: base A, reviewed head
 * B, HEAD C, plus a side commit X that is not an ancestor of HEAD (what a
 * rebase leaves behind). Stub `codex` records its argv; stub `gh` answers the
 * PR number and the PR's comments.
 */
const SCRIPT = resolve(import.meta.dirname, 'codex-review.sh');
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
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@t',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@t',
    },
  }).trim();
}

function commit(cwd: string, file: string): string {
  writeFileSync(join(cwd, file), file);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', file);
  return git(cwd, 'rev-parse', 'HEAD');
}

function makeRepo(opts: { mergeAfterB?: boolean } = {}) {
  const dir = tmp('codex-rounds-repo-');
  git(dir, 'init', '-q', '-b', 'main');
  const a = commit(dir, 'a.txt');
  git(dir, 'checkout', '-q', '-b', 'side');
  const x = commit(dir, 'x.txt');
  git(dir, 'checkout', '-q', '-b', 'feature', a);
  const b = commit(dir, 'b.txt');
  if (opts.mergeAfterB) git(dir, 'merge', '-q', '--no-ff', '--no-edit', 'side');
  const c = commit(dir, 'c.txt');
  return { dir, a, b, c, x };
}

function stubs(verdict: string, gateComments: string) {
  const dir = tmp('codex-rounds-stub-');
  const args = join(dir, 'args.log');
  const canned = join(dir, 'canned.log');
  const comments = join(dir, 'comments.txt');
  writeFileSync(canned, verdict);
  writeFileSync(comments, gateComments);
  const codex = join(dir, 'codex');
  writeFileSync(codex, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${args}'\ncat '${canned}'\n`);
  const gh = join(dir, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
case "$*" in
  *'startswith("Review gate:")'*) cat '${comments}' ;;
  *comments*) ;;
  'pr view --json number'*) echo 7 ;;
esac
exit 0
`
  );
  chmodSync(codex, 0o755);
  chmodSync(gh, 0o755);
  return { codex, gh, args, log: join(dir, 'review.log') };
}

function run(
  repo: { dir: string; a: string },
  s: ReturnType<typeof stubs>,
  post = true
): { code: number; out: string; base: string; instructions: string } {
  let code = 0;
  let out: string;
  try {
    out = execFileSync('bash', [SCRIPT, repo.a, ...(post ? ['--post'] : [])], {
      cwd: repo.dir,
      encoding: 'utf8',
      env: { ...process.env, CODEX_BIN: s.codex, GH_BIN: s.gh, CODEX_REVIEW_LOG: s.log },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    code = e.status;
    out = `${e.stdout}${e.stderr}`;
  }
  const argv = readFileSync(s.args, 'utf8').trimEnd().split('\n');
  return { code, out, base: argv[argv.indexOf('--base') + 1]!, instructions: argv.at(-1)! };
}

const gate = (base: string, head: string, verdict = '1 findings, not addressed') =>
  `Review gate: codex reviewed ${base.slice(0, 9)}..${head.slice(0, 9)} — ${verdict}\nsha256: abc`;
const FINDING = 'codex\n- [P2] src/a.ts:3 — a defect.\n';

describe('codex-review.sh rounds (MYK9-1590)', () => {
  it('round 1 (no codex gate line on the PR) reviews the whole branch', () => {
    const repo = makeRepo();
    const r = run(repo, stubs(FINDING, ''));
    expect(r.base).toBe(repo.a);
    expect(r.instructions).toContain('requested whole-branch review');
    expect(r.instructions).not.toContain('Fix-range round');
  });

  it('round 2 on a fast-forward head reviews only the commits since the last reviewed head', () => {
    const repo = makeRepo();
    const r = run(repo, stubs(FINDING, gate(repo.a, repo.b)));
    expect(r.base).toBe(repo.b);
    expect(r.out).toContain(`fix range ${repo.b.slice(0, 9)}..${repo.c.slice(0, 9)}`);
    expect(r.instructions).toContain('requested fix-range review');
    expect(r.instructions).not.toContain('whole-branch review');
    expect(r.instructions).toContain('any P0 or P1 anywhere in the branch');
    expect(r.instructions).toContain('- [earlier-round P2]');
  });

  it('reads the LATEST codex gate line, ignoring other reviewers', () => {
    const repo = makeRepo();
    const comments = [
      gate(repo.a, repo.a),
      gate(repo.a, repo.b),
      `Review gate: claude reviewed ${repo.a.slice(0, 9)}..${repo.c.slice(0, 9)} — no findings`,
    ].join('\n');
    expect(run(repo, stubs(FINDING, comments)).base).toBe(repo.b);
  });

  it('falls back to the whole branch after a rebase (last head is not an ancestor)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, gate(repo.a, repo.x))).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the last head no longer exists', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, gate(repo.a, 'deadbeefdeadbeef'))).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the range holds a merge', () => {
    const repo = makeRepo({ mergeAfterB: true });
    expect(run(repo, stubs(FINDING, gate(repo.a, repo.b))).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the last reviewed head IS HEAD', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, gate(repo.a, repo.c))).base).toBe(repo.a);
  });

  it('without --post never narrows (no PR lookup)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, gate(repo.a, repo.b)), false).base).toBe(repo.a);
  });

  it('a P1 in previously reviewed code still blocks in round 2 (known answer)', () => {
    const repo = makeRepo();
    const verdict = 'codex\n- [P1] src/old.ts:9 — reviewed in round 1, still loses a score.\n';
    expect(run(repo, stubs(verdict, gate(repo.a, repo.b)), false).code).toBe(1);
  });

  it('a P0/P1 tagged earlier-round or unlikely is read as a normal finding and blocks', () => {
    const repo = makeRepo();
    const verdict = [
      'codex',
      'No actionable defects found.',
      '',
      'Not actionable this round',
      '- [earlier-round P1] src/old.ts:9 — loses a score.',
    ].join('\n');
    const r = run(repo, stubs(verdict, ''), false);
    expect(r.code).toBe(1);
    expect(r.out).toContain('- [P1] src/old.ts:9');
  });

  describe('likelihood cap', () => {
    it('every round tells Codex to state the trigger and cap improbable findings at P3', () => {
      const repo = makeRepo();
      for (const comments of ['', gate(repo.a, repo.b)]) {
        const { instructions } = run(repo, stubs(FINDING, comments));
        expect(instructions).toContain('realistic trigger');
        expect(instructions).toContain('is P3 at most');
        expect(instructions).toContain('lost or corrupted show-day data');
        expect(instructions).toContain('- [unlikely P3]');
      }
    });

    it('a canned improbable-timing finding reported as unlikely P3 does not block (known answer)', () => {
      const repo = makeRepo();
      const verdict = [
        'codex',
        'No actionable defects found.',
        '',
        'Not actionable this round',
        '- [unlikely P3] src/sync.ts:40 — a disconnect inside one request leaves a spinner; trigger: network drop mid-call, rare; Retry recovers.',
        '- [earlier-round P2] src/card.tsx:12 — label truncates at 320px.',
      ].join('\n');
      const r = run(repo, stubs(verdict, ''), false);
      expect(r.code).toBe(0);
      expect(r.out).toContain('2 finding(s) not actionable this round');
      expect(r.out).toContain('- [unlikely P3] src/sync.ts:40');
    });
  });
});
