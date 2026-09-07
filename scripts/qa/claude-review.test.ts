import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The Claude half of the review gate gets the same behavioural treatment as the
 * Codex half: a stub `claude` prints a canned log and we assert the wrapper's
 * exit code and what reached the PR. `claude -p` exits 0 on an interrupted run,
 * a usage limit and on findings alike, so every one of these is a case where
 * the exit code and the verdict disagree.
 */
const SCRIPT = resolve(import.meta.dirname, 'claude-review.sh');
const CODEX_SCRIPT = resolve(import.meta.dirname, 'codex-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubClaude(
  output: string,
  exitCode = 0,
  delaySeconds = 0,
  authExit = 0
): { bin: string; log: string; args: string; stateDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'claude-stub-'));
  dirs.push(dir);
  const bin = join(dir, 'claude');
  const canned = join(dir, 'canned.log');
  const args = join(dir, 'args.log');
  writeFileSync(canned, output);
  // The delay models the real thing: `claude -p` prints nothing until it is
  // done, so a slow stub is how --detach / --wait get exercised.
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
# 'claude auth status' is the wrapper's preflight; only -p runs count as a review.
if [ "$1" = "auth" ]; then exit ${authExit}; fi
printf '%s\\n' "$@" > '${args}'
sleep ${delaySeconds}
cat ${JSON.stringify(canned)}
exit ${exitCode}
`
  );
  chmodSync(bin, 0o755);
  return { bin, log: join(dir, 'review.log'), args, stateDir: join(dir, 'state') };
}

/** The local HEAD the wrapper will bind its evidence to. */
const LOCAL_HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

function stubGh(
  opts: {
    commentExit?: number;
    prior?: string;
    prHead?: string;
    commentsExit?: number;
    secondCommentExit?: number;
  } = {}
): {
  bin: string;
  calls: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(dir);
  const calls = join(dir, 'calls.log');
  const prior = join(dir, 'prior.txt');
  const counter = join(dir, 'comment-count');
  const bin = join(dir, 'gh');
  writeFileSync(prior, opts.prior ?? '');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" >> '${calls}'
printf -- '---\\n' >> '${calls}'
case "$*" in
  *headRefOid*) echo '${opts.prHead ?? LOCAL_HEAD}' ;;
  *comments*) cat '${prior}'; exit ${opts.commentsExit ?? 0} ;;
  'pr view --json number'*) echo 7 ;;
  'pr comment'*)
    n=$(cat '${counter}' 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > '${counter}'
    if [ "$n" -ge 2 ]; then exit ${opts.secondCommentExit ?? opts.commentExit ?? 0}; fi
    exit ${opts.commentExit ?? 0} ;;
esac
`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}

/**
 * Every `--body` the stub `gh` was handed, in order. The wrapper also READS the
 * PR (number, head SHA, prior comments), so "nothing was posted" is an empty
 * body list, not an absent calls file.
 */
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
  stub: { bin: string; log: string; stateDir?: string },
  gh: { bin: string },
  args: string[] = ['--post', '7']
): { code: number; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        CLAUDE_BIN: stub.bin,
        CLAUDE_REVIEW_LOG: stub.log,
        GH_BIN: gh.bin,
        CLAUDE_REVIEW_NET_PROBE: process.env.CLAUDE_REVIEW_NET_PROBE_TEST ?? 'echo 200',
        ...(stub.stateDir ? { CLAUDE_REVIEW_STATE_DIR: stub.stateDir } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

describe('claude-review.sh', () => {
  it('sends /code-review plus the SAME verdict contract codex-review.sh sends', () => {
    // Extracted, not copied: two reviewers judged by two paragraphs is how a
    // gate quietly starts accepting different things from each harness.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    expect(run(stub, gh, ['7']).code).toBe(0);
    const args = readFileSync(stub.args, 'utf8').trimEnd().split('\n');
    expect(args[0]).toBe('-p');
    const prompt = args.slice(1).join('\n');
    expect(prompt.split('\n')[0]).toBe('/code-review 7');
    const contract = readFileSync(CODEX_SCRIPT, 'utf8').match(/^REVIEW_INSTRUCTIONS='(.*)'$/m)?.[1];
    expect(contract, 'codex-review.sh must expose REVIEW_INSTRUCTIONS').toBeTruthy();
    expect(contract!.length).toBeGreaterThan(200);
    expect(prompt).toContain(contract!);
  });

  it('--post on a clean review posts evidence naming claude as the reviewer', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    expect(run(stub, gh).code).toBe(0);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(
      /^Review gate: claude reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings\nlog sha256: [0-9a-f]{64}\n/
    );
  });

  it('--post on findings posts a NON-evidence comment and exits 1', () => {
    const stub = stubClaude('Two problems.\n\n- [P1] Something is broken');
    const gh = stubGh();
    const r = run(stub, gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted[0].split('\n')[0]).toMatch(
      /^Claude findings for [0-9a-f]{9} \(not gate evidence\):$/
    );
    expect(posted[0]).toContain('[P1] Something is broken');
  });

  it('--post on findings also WITHDRAWS any clean evidence already on this head', () => {
    const stub = stubClaude('- [P1] one\n- [P3] two\n');
    const gh = stubGh();
    expect(run(stub, gh).code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(2);
    expect(posted[1].split('\n')[0]).toMatch(
      /^Review gate: claude reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — 2 findings, not addressed$/
    );
  });

  it('posts and withdraws when a review reported findings AND then was interrupted', () => {
    // Findings come before every incompleteness guard (Codex, #2115 round 5).
    const stub = stubClaude('- [P1] one\n\nReview was interrupted\n');
    const gh = stubGh();
    const r = run(stub, gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(2);
    expect(posted[1].split('\n')[0]).toMatch(/— 1 findings, not addressed$/);
  });

  it('exits 2 when the withdrawal could not be posted, even though the findings were', () => {
    const stub = stubClaude('- [P1] one\n');
    const gh = stubGh({ secondCommentExit: 1 });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('could NOT be withdrawn');
    expect(bodies(gh.calls)).toHaveLength(2);
  });

  it('counts N from its own earlier findings comments', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({
      prior:
        'Claude findings for abc123456 (not gate evidence):\n\n- [P1] one\n- [P2] two\n- [P3] three\n',
    });
    expect(run(stub, gh).code).toBe(0);
    expect(bodies(gh.calls)[0]).toMatch(/— 3 findings, all addressed\n/);
  });

  it('exits 2 when the review was clean but the evidence did NOT get posted', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({ commentExit: 1 });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it('refuses to review when the PR head is not the local HEAD', () => {
    // `/code-review <pr>` reads the REMOTE head; the evidence names local HEAD.
    // With an unpushed commit a clean review would attest to unreviewed code.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({ prHead: '0'.repeat(40) });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('local HEAD');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('exits 2 when the prior-findings lookup fails, instead of posting "no findings"', () => {
    // A failed lookup returns an empty history, which reads as "there were
    // never any findings" (Codex review of #2115, round 2).
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh({ commentsExit: 1, prior: '- [P1] one\n' });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('exits 2 when the findings comment could not be posted', () => {
    // The next clean run counts N from these comments, so a dropped one makes
    // the evidence say "no findings" for a head that had them.
    const stub = stubClaude('- [P1] Something is broken\n');
    const gh = stubGh({ commentExit: 1 });
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it.each([
    ['a usage-limit abort that still exits 0', "ERROR: You've hit your usage limit\n", 0],
    [
      'a sentence that opens "No actionable" but asserts no VERDICT is available',
      'No actionable verdict is available; only one file has been inspected.\n',
      0,
    ],
    ['an empty log', '', 0],
    ['prose that is neither findings nor a clean verdict', 'The change looks fine to me.\n', 0],
    [
      'a clean sentence about an incomplete review',
      'The review did not run. No actionable defects found.\n',
      0,
    ],
    ['a clean verdict with a non-zero cli exit', 'No actionable defects found.\n', 1],
    [
      'a clean sentence only in a later paragraph',
      'Summary of changes.\n\nNo actionable defects found.\n',
      0,
    ],
  ])('exits 2 without posting on %s', (_label, output, exitCode) => {
    const stub = stubClaude(output, exitCode);
    const gh = stubGh();
    const r = run(stub, gh);
    expect(r.code).toBe(2);
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('without --post it writes nothing to the PR', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    const r = run(stub, gh, ['7']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('post-review-gate.sh');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('refuses to review at all when the contract cannot be read', () => {
    // A wrapper that silently reviewed without the contract paragraph would
    // accept "looks good to me" as a verdict, which is the whole failure mode.
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    const dir = mkdtempSync(join(tmpdir(), 'no-contract-'));
    dirs.push(dir);
    const copy = join(dir, 'claude-review.sh');
    writeFileSync(copy, readFileSync(SCRIPT, 'utf8'));
    writeFileSync(
      join(dir, 'review-verdict.sh'),
      readFileSync(resolve(import.meta.dirname, 'review-verdict.sh'), 'utf8')
    );
    writeFileSync(join(dir, 'codex-review.sh'), '#!/usr/bin/env bash\necho hi\n');
    let code = 0;
    let out = '';
    try {
      out = execFileSync('bash', [copy, '7'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          CLAUDE_BIN: stub.bin,
          CLAUDE_REVIEW_LOG: stub.log,
          GH_BIN: gh.bin,
          CLAUDE_REVIEW_NET_PROBE: process.env.CLAUDE_REVIEW_NET_PROBE_TEST ?? 'echo 200',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const e = error as { status: number; stdout: string; stderr: string };
      code = e.status;
      out = `${e.stdout}${e.stderr}`;
    }
    expect(code).toBe(2);
    expect(out).toContain('verdict contract');
  });

  it("recognizes Claude's bold-bracket findings (`- **[P2]**`) as findings, not as unrecognized output", () => {
    // Verbatim shape from the 2026-09-07 ten-minute review of #2124, which the
    // plain `- [P2]` matcher discarded as "unrecognized output".
    const stub = stubClaude(
      [
        '- **[P2]** `supabase/migrations/20260907150000_add_missing_fk_leading_indexes.sql:8` — covers three of the five FKs.',
        '',
        '- **[P3]** `apps/myk9show/src/components/shows/browse/monthScrubber.helpers.ts:126` — recovered tile re-prints the year.',
        '',
        'Checked and found sound (no finding): the int2vector predicate is correct.',
      ].join('\n')
    );
    const gh = stubGh();
    const r = run(stub, gh, ['--post', '7']);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted.some(b => b.startsWith('Claude findings for'))).toBe(true);
    expect(
      posted.some(
        b => b.startsWith('Review gate: claude reviewed') && b.includes('2 findings, not addressed')
      )
    ).toBe(true);
  });

  it('a trailing --wait with no duration is a usage error (exit 2), not a synchronous review', () => {
    const stub = stubClaude('No actionable defects found.');
    const gh = stubGh();
    const r = run(stub, gh, ['7', '--wait']);
    expect(r.code).toBe(2);
    expect(r.out).toContain('--wait needs a number');
    expect(existsSync(stub.args)).toBe(false); // claude was never invoked
  });

  describe('sandbox preflight (Codex denies the Keychain and the network)', () => {
    it('exits 2 in seconds with the escalation hint when claude reports not logged in', () => {
      const stub = stubClaude('No actionable defects found.', 0, 0, 1);
      const gh = stubGh();
      const r = run(stub, gh, ['7']);
      expect(r.code).toBe(2);
      expect(r.out).toContain('not logged in HERE');
      expect(r.out).toContain('escalated permissions');
      expect(existsSync(stub.args)).toBe(false); // the review itself never started
    });

    it('exits 2 with the escalation hint when the network probe reports 000', () => {
      const stub = stubClaude('No actionable defects found.');
      const gh = stubGh();
      const prev = process.env.CLAUDE_REVIEW_NET_PROBE_TEST;
      process.env.CLAUDE_REVIEW_NET_PROBE_TEST = 'echo 000';
      try {
        const r = run(stub, gh, ['7']);
        expect(r.code).toBe(2);
        expect(r.out).toContain('no network');
        expect(existsSync(stub.args)).toBe(false);
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_REVIEW_NET_PROBE_TEST;
        else process.env.CLAUDE_REVIEW_NET_PROBE_TEST = prev;
      }
    });
  });

  describe('--detach / --wait (a per-command timeout must never kill the review)', () => {
    it('--wait with nothing detached is exit 2, not a verdict', () => {
      const stub = stubClaude('No actionable defects found.');
      const gh = stubGh();
      const r = run(stub, gh, ['--wait', '1', '7']);
      expect(r.code).toBe(2);
      expect(r.out).toContain('no detached review');
    });

    it('--detach returns at once, records running, and --wait reports 3 until the child finishes, then its exit', async () => {
      const stub = stubClaude('No actionable defects found.', 0, 4);
      const gh = stubGh();
      const started = Date.now();
      const detached = run(stub, gh, ['--detach', '7']);
      expect(detached.code).toBe(0);
      expect(Date.now() - started).toBeLessThan(3000); // did not wait for the 4s stub
      expect(detached.out).toContain('detached PR #7 review');
      expect(readFileSync(join(stub.stateDir, 'claude-review-7.status'), 'utf8')).toMatch(
        /^running since/
      );

      const early = run(stub, gh, ['--wait', '1', '7']);
      expect(early.code).toBe(3);
      expect(early.out).toContain('still running');

      const done = run(stub, gh, ['--wait', '30', '7']);
      expect(done.code).toBe(0);
      expect(done.out).toContain('No actionable defects found.');
      expect(done.out).toContain('finished with exit 0');
      expect(readFileSync(join(stub.stateDir, 'claude-review-7.status'), 'utf8').trim()).toBe('0');
    }, 20_000);

    it('a detached review with findings surfaces exit 1 through --wait', () => {
      const stub = stubClaude('- [P1] Something is broken', 0, 2);
      const gh = stubGh();
      expect(run(stub, gh, ['--detach', '7']).code).toBe(0);
      const done = run(stub, gh, ['--wait', '30', '7']);
      expect(done.code).toBe(1);
      expect(done.out).toContain('[P1]');
    });

    it('--detach forwards --post to the child (evidence still goes through the poster)', () => {
      const stub = stubClaude('No actionable defects found.', 0, 1);
      const gh = stubGh();
      expect(run(stub, gh, ['--detach', '--post', '7']).code).toBe(0);
      const done = run(stub, gh, ['--wait', '30', '7']);
      expect(done.code).toBe(0);
      expect(bodies(gh.calls).some(b => b.startsWith('Review gate: claude reviewed'))).toBe(true);
    });
  });
});
