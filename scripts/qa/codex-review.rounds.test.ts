import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Round 2+ fix-range review and the likelihood cap (MYK9-1590). The wrapper
 * runs inside a throwaway git repo so ancestry is real: base A, reviewed head
 * B, HEAD C, plus a side commit X that is not an ancestor of HEAD (what a
 * rebase leaves behind). Stub `codex` records its argv; stub `gh` answers the
 * PR number, runs the wrapper's own `-q` filter through real jq over fixture
 * comments (so the trusted-author filter is exercised, not assumed), and
 * records every posted body.
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

interface Comment {
  body: string;
  authorAssociation?: string;
}

function stubs(verdict: string, comments: Comment[]) {
  const dir = tmp('codex-rounds-stub-');
  const args = join(dir, 'args.log');
  const canned = join(dir, 'canned.log');
  const json = join(dir, 'comments.json');
  const posted = join(dir, 'posted.log');
  writeFileSync(canned, verdict);
  writeFileSync(
    json,
    JSON.stringify({ comments: comments.map(c => ({ authorAssociation: 'OWNER', ...c })) })
  );
  const codex = join(dir, 'codex');
  writeFileSync(codex, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > '${args}'\ncat '${canned}'\n`);
  const gh = join(dir, 'gh');
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
case "$*" in
  *'--json comments'*)
    q=""; prev=""
    for a in "$@"; do [ "$prev" = "-q" ] && q="$a"; prev="$a"; done
    jq -r "$q" '${json}' ;;
  'pr view --json number'*) echo 7 ;;
  'pr comment'*)
    prev=""
    for a in "$@"; do [ "$prev" = "--body" ] && printf '%s\\n===\\n' "$a" >> '${posted}'; prev="$a"; done ;;
esac
exit 0
`
  );
  chmodSync(codex, 0o755);
  chmodSync(gh, 0o755);
  return { codex, gh, args, posted, log: join(dir, 'review.log') };
}

function postedBodies(s: { posted: string }): string[] {
  return existsSync(s.posted)
    ? readFileSync(s.posted, 'utf8').split('\n===\n').filter(Boolean)
    : [];
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

/** The wrapper's findings comment: line 2 is the coverage claim (absent when the review aborted). */
const findings = (head: string, from?: string, authorAssociation = 'OWNER'): Comment => ({
  authorAssociation,
  body: `Codex findings for ${head.slice(0, 9)} (not gate evidence):\n${
    from ? `Coverage: complete from ${from.slice(0, 9)}` : ''
  }\n\n- [P2] src/a.ts:3 — a defect.`,
});
const FINDING = 'codex\n- [P2] src/a.ts:3 — a defect.\n';

describe('codex-review.sh rounds (MYK9-1590)', () => {
  it('round 1 (no findings comment on the PR) reviews the whole branch', () => {
    const repo = makeRepo();
    const r = run(repo, stubs(FINDING, []));
    expect(r.base).toBe(repo.a);
    expect(r.instructions).toContain('requested whole-branch review');
    expect(r.instructions).not.toContain('Fix-range round');
  });

  it('round 2 on a fast-forward head reviews only the commits since the last completed review', () => {
    const repo = makeRepo();
    const r = run(repo, stubs(FINDING, [findings(repo.b, repo.a)]));
    expect(r.base).toBe(repo.b);
    expect(r.out).toContain(`fix range ${repo.b.slice(0, 9)}..${repo.c.slice(0, 9)}`);
    expect(r.instructions).toContain('requested fix-range review');
    expect(r.instructions).not.toContain('whole-branch review');
    expect(r.instructions).toContain('any P0 or P1 anywhere in the branch');
    expect(r.instructions).toContain('- [earlier-round P2]');
  });

  it('anchors on the LATEST trusted findings comment', () => {
    const repo = makeRepo();
    const comments = [findings(repo.a, repo.a), findings(repo.b, repo.a)];
    expect(run(repo, stubs(FINDING, comments)).base).toBe(repo.b);
  });

  it('ignores an untrusted commenter, however recent (public repo)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.b, repo.a, 'NONE')])).base).toBe(repo.a);
    const mixed = [findings(repo.a, repo.a), findings(repo.b, repo.a, 'CONTRIBUTOR')];
    expect(run(repo, stubs(FINDING, mixed)).base).toBe(repo.a);
  });

  it('does not narrow on a review that reported findings and then aborted (no coverage line)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.b)])).base).toBe(repo.a);
  });

  it('does not narrow on a review that covered less than the branch (narrower base)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.c, repo.b)])).base).toBe(repo.a);
    expect(run(repo, stubs(FINDING, [findings(repo.b, repo.b)])).base).toBe(repo.a);
  });

  it('falls back to the whole branch after a rebase (last head is not an ancestor)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.x, repo.a)])).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the last head no longer exists', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings('deadbeefdeadbeef', repo.a)])).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the range holds a merge', () => {
    const repo = makeRepo({ mergeAfterB: true });
    expect(run(repo, stubs(FINDING, [findings(repo.b, repo.a)])).base).toBe(repo.a);
  });

  it('falls back to the whole branch when the last reviewed head IS HEAD', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.c, repo.a)])).base).toBe(repo.a);
  });

  it('without --post never narrows (no PR lookup)', () => {
    const repo = makeRepo();
    expect(run(repo, stubs(FINDING, [findings(repo.b, repo.a)]), false).base).toBe(repo.a);
  });

  describe('the findings comment records coverage', () => {
    it('a completed round 1 claims coverage from the fork point', () => {
      const repo = makeRepo();
      const s = stubs(FINDING, []);
      expect(run(repo, s).code).toBe(1);
      expect(postedBodies(s)[0]?.split('\n')[1]).toBe(
        `Coverage: complete from ${repo.a.slice(0, 9)}`
      );
    });

    it('a completed round 2 carries the earlier coverage forward', () => {
      const repo = makeRepo();
      const s = stubs(FINDING, [findings(repo.b, repo.a)]);
      run(repo, s);
      expect(postedBodies(s)[0]?.split('\n')[1]).toBe(
        `Coverage: complete from ${repo.a.slice(0, 9)}`
      );
    });

    it('a findings verdict that says it could not complete the review claims no coverage', () => {
      const repo = makeRepo();
      const s = stubs(
        `codex\nUnable to complete the review: the diff was too large.\n- [P2] src/a.ts:3 — a defect.\n`,
        []
      );
      expect(run(repo, s).code).toBe(1);
      expect(postedBodies(s)[0]?.split('\n')[1]).toBe('');
    });

    it('a review that reported findings and then was interrupted claims no coverage', () => {
      const repo = makeRepo();
      const s = stubs(`${FINDING}Review was interrupted\n`, []);
      expect(run(repo, s).code).toBe(1);
      expect(postedBodies(s)[0]?.split('\n')[1]).toBe('');
    });
  });

  it('a P1 in previously reviewed code still blocks in round 2 (known answer)', () => {
    const repo = makeRepo();
    const verdict = 'codex\n- [P1] src/old.ts:9 — reviewed in round 1, still loses a score.\n';
    expect(run(repo, stubs(verdict, [findings(repo.b, repo.a)])).code).toBe(1);
  });

  it('a P0/P1 tagged earlier-round or unlikely blocks, and the withdrawal posts (poster reads the same log)', () => {
    const repo = makeRepo();
    const verdict = [
      'codex',
      'No actionable defects found.',
      '',
      'Not actionable this round',
      '- [unlikely P1] src/old.ts:9 — loses a score.',
    ].join('\n');
    const s = stubs(verdict, []);
    const r = run(repo, s);
    expect(r.code).toBe(1);
    expect(r.out).toContain('- [P1] src/old.ts:9');
    const posted = postedBodies(s);
    expect(posted).toHaveLength(2);
    expect(posted[1]?.split('\n')[0]).toMatch(
      /^Review gate: codex reviewed .* — 1 findings, not addressed$/
    );
  });

  describe('likelihood cap', () => {
    it('every round tells Codex to state the trigger and cap improbable findings at P3', () => {
      const repo = makeRepo();
      for (const comments of [[], [findings(repo.b, repo.a)]]) {
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
      const r = run(repo, stubs(verdict, []), false);
      expect(r.code).toBe(0);
      expect(r.out).toContain('2 finding(s) not actionable this round');
      expect(r.out).toContain('- [unlikely P3] src/sync.ts:40');
    });
  });
});
