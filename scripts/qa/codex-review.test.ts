import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The wrapper is a program, so it gets a behavioural test: a stub `codex` on
 * PATH prints a canned log and we assert the wrapper's exit code and output.
 * Grepping the wrapper's source for the abort phrases would prove someone
 * typed them, not that the wrapper acts on them.
 */
const SCRIPT = resolve(import.meta.dirname, 'codex-review.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubCodex(output: string, exitCode = 0): { bin: string; log: string; args: string } {
  const dir = mkdtempSync(join(tmpdir(), 'codex-stub-'));
  dirs.push(dir);
  const bin = join(dir, 'codex');
  const canned = join(dir, 'canned.log');
  const args = join(dir, 'args.log');
  writeFileSync(canned, output);
  writeFileSync(
    bin,
    `#!/usr/bin/env bash
printf '%s\\n' "$@" > '${args}'
cat ${JSON.stringify(canned)}
exit ${exitCode}
`
  );
  chmodSync(bin, 0o755);
  return { bin, log: join(dir, 'review.log'), args };
}

function run(stub: { bin: string; log: string }): { code: number; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, 'HEAD'], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_BIN: stub.bin, CODEX_REVIEW_LOG: stub.log },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

/**
 * `--post` makes the wrapper a writer, so the posting paths get the same
 * treatment: a stub `gh` records every invocation and we assert what reached
 * the PR. `pr view --json number` answers 7; `pr view 7 --json comments`
 * answers the wrapper's own earlier findings comments (jq already applied by
 * the real gh, so the stub prints the joined text).
 */
function stubGh(
  opts: {
    commentExit?: number;
    prior?: string;
    commentsExit?: number;
    /** Exit code for the SECOND `pr comment` only (the withdrawal). */
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

function runPost(
  stub: { bin: string; log: string },
  gh: { bin: string },
  args: string[] = ['HEAD', '--post']
): { code: number; out: string } {
  try {
    const out = execFileSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: { ...process.env, CODEX_BIN: stub.bin, CODEX_REVIEW_LOG: stub.log, GH_BIN: gh.bin },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
}

/**
 * Every `--body` argument the stub `gh` was handed, in order. A path the
 * wrapper leaves before touching `gh` at all writes no calls file, and that is
 * still "nothing was posted".
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

describe('codex-review.sh', () => {
  it('instructs an explicit verdict while retaining whole-branch review', () => {
    const stub = stubCodex('codex\nNo actionable defects found.');
    expect(run(stub).code).toBe(0);
    const args = readFileSync(stub.args, 'utf8').trimEnd().split('\n');
    expect(args.slice(0, 4)).toEqual(['review', '--base', 'HEAD', '-c']);
    expect(args).toHaveLength(5);
    expect(args[4]).toMatch(/^developer_instructions=/);
    expect(args[4]).toContain('No actionable defects found.');
    expect(args[4]).toContain('- [P0]');
    expect(args[4]).toContain('Unable to complete the review');
    expect(args[4]).toContain('Only assert a clean verdict after completing');
  });

  it('exits 2 and says GATE DID NOT RUN on a usage-limit abort, even though codex exited 0', () => {
    const stub = stubCodex(
      [
        'Review the diff below',
        '+  grep for "Review was interrupted" in the diff must not count',
        "ERROR: You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage",
        'Review was interrupted. Please re-run /review and wait for it to complete.',
        'codex',
        'Review was interrupted. Please re-run /review and wait for it to complete.',
      ].join('\n'),
      0
    );
    const r = run(stub);
    expect(r.code).toBe(2);
    expect(r.out).toContain('GATE DID NOT RUN');
    expect(r.out).not.toContain('Review gate: codex reviewed');
  });

  it('does not mistake the diff echo for an abort (anchored grep)', () => {
    const stub = stubCodex(
      [
        '+ echo "Review was interrupted" # quoted inside a diff line',
        'codex',
        'No actionable defects found.',
      ].join('\n')
    );
    const r = run(stub);
    expect(r.code).toBe(0);
    expect(r.out).toContain('Review gate: codex reviewed');
  });

  it('exits 1 with the findings when the review reports any [P*] item', () => {
    const stub = stubCodex(
      [
        'codex',
        'Two problems.',
        '',
        'Full review comments:',
        '',
        '- [P2] Something is wrong — file.ts:10',
        '  detail',
      ].join('\n')
    );
    const r = run(stub);
    expect(r.code).toBe(1);
    expect(r.out).toContain('[P2] Something is wrong');
    expect(r.out).not.toContain('Review gate: codex reviewed');
  });

  it('exits 0 and prints the exact evidence line on a clean verdict', () => {
    const stub = stubCodex(['codex', 'No actionable defects found in the diff.'].join('\n'));
    const r = run(stub);
    expect(r.code).toBe(0);
    // Shape the review-gate checker accepts: two 9-char SHAs, em dash, exact verdict.
    expect(r.out).toMatch(
      /^Review gate: codex reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings$/m
    );
    expect(readFileSync(stub.log, 'utf8')).toContain('No actionable defects');
  });

  it.each([
    [
      'cli failure with prose in the verdict block',
      'codex\nUnable to complete the review because the connection failed.',
      1,
    ],
    [
      'cli exit 0 but no explicit clean verdict',
      'codex\nUnable to complete the review because the connection failed.',
      0,
    ],
    ['explicit clean verdict but cli exit 1', 'codex\nNo actionable defects found.', 1],
    ['partial output with no findings bullets', 'codex\nReviewing... 3 of 12 files read so far', 0],
    [
      'the MYK9-416 summary-only verdict remains unrecognized',
      'codex\nThe change accepts summary-prefixed clean verdicts while preserving existing failure and findings checks. All 17 focused tests passed, as did shell syntax and diff whitespace checks.',
      0,
    ],
    [
      'a sentence that merely CONTAINS the phrase',
      'codex\nThe run stopped before reaching a no actionable verdict.',
      0,
    ],
    [
      // The sentence-boundary arm added for #2074 is case-sensitive so an
      // ellipsis cannot manufacture a sentence opening out of mid-sentence
      // prose. Lowercase after "..." is still mid-sentence.
      'an ellipsis followed by the lowercase phrase',
      'codex\nThe run stopped... no actionable verdict was ever reached.',
      0,
    ],
    [
      'clean wording only in a later paragraph',
      'codex\nThe review could not finish.\n \t\nNo actionable defects found.',
      0,
    ],
    [
      // "No actionable" alone is not the contract sentence: this one asserts
      // that no VERDICT is available, i.e. the opposite of a clean review
      // (Codex review of #2115, P2). The sentence must name findings.
      'a sentence that opens "No actionable" but asserts no verdict is available',
      'codex\nNo actionable verdict is available; only one file has been inspected.',
      0,
    ],
    [
      'a review that did not run despite clean wording',
      'codex\nThe review did not run. No actionable defects found.',
      0,
    ],
    [
      'an interrupted review despite clean wording',
      'codex\nThe review was interrupted. No actionable defects found.',
      0,
    ],
  ])(
    'exits 2 without evidence on %s — clean is a positive match, not the absence of findings',
    (_, output, exitCode) => {
      // Codex review of #2063, P1: the first wrapper certified any verdict block
      // without a [P*] bullet as clean, including a connection failure.
      const r = run(stubCodex(output, exitCode));
      expect(r.code).toBe(2);
      expect(r.out).not.toContain('Review gate: codex reviewed');
    }
  );

  it.each([
    'No actionable defects found in the diff.',
    'No actionable defects found. Tests did not run because this change only updates documentation.',
    'No actionable defects found. The change handles interrupted downloads correctly.',
    // Exact verdict from #2064 (MYK9-415).
    'The diff adds nine relative skill symlinks, all resolving to tracked directories containing SKILL.md. No actionable defects found; git diff --check passes.',
    '\n\nThe diff adds skill symlinks.\nNo actionable defects found.\n\nVerification passed.',
    'No actionable regressions were identified in the changes.',
    'no actionable issues',
    // Real wording from /tmp/codex-review-2045.log — the noun phrase varies,
    // only the "No actionable" opening is stable (Codex review of #2063, P2).
    'No actionable correctness, security, or data-flow regressions were found. The focused migration contract tests passed.',
    // Real wording from #2074: Codex led with a summary sentence, so the clean
    // assertion is not at the start of the block. Anchoring there rejected a
    // review that had run and found nothing.
    'The documentation-only change restores validation-profile guidance while preserving existing plan-hygiene requirements. No actionable defects found; git diff --check passed.',
  ])('accepts the explicit clean verdict %j', verdict => {
    const r = run(stubCodex(`codex\n${verdict}`));
    expect(r.code).toBe(0);
    expect(r.out).toContain('Review gate: codex reviewed');
  });

  it('exits 2 when there is no verdict block at all', () => {
    const stub = stubCodex('nothing useful here');
    expect(run(stub).code).toBe(2);
  });

  it('rejects findings even when the first paragraph asserts a clean verdict', () => {
    const r = run(stubCodex('codex\nNo actionable defects found.\n\n- [P1] A defect'));
    expect(r.code).toBe(1);
    expect(r.out).not.toContain('Review gate: codex reviewed');
  });

  it('--post on a clean review posts evidence through the poster, never by hand', () => {
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh();
    const r = runPost(stub, gh);
    expect(r.code).toBe(0);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatch(
      /^Review gate: codex reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — no findings\nlog sha256: [0-9a-f]{64}\n/
    );
    // The poster carries what the reviewer actually said, not just a claim.
    expect(posted[0]).toContain('No actionable defects found.');
  });

  it('--post on findings posts them as a NON-evidence comment and still exits 1', () => {
    const stub = stubCodex(['codex', 'Two problems.', '', '- [P2] Something is wrong'].join('\n'));
    const gh = stubGh();
    const r = runPost(stub, gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted[0]).toMatch(/^Codex findings for [0-9a-f]{9} \(not gate evidence\):/);
    // review-gate.ts only reads a comment whose FIRST line is the evidence line.
    expect(posted[0].split('\n')[0]).not.toMatch(/^Review gate:/);
    expect(posted[0]).toContain('[P2] Something is wrong');
  });

  it('--post on findings also WITHDRAWS any clean evidence already on this head', () => {
    // The findings comment is invisible to review-gate.ts, so on a head that
    // already carries clean evidence the gate would stay green over defects
    // just reported (Codex review of #2115, round 3).
    const stub = stubCodex(['codex', '- [P1] one', '- [P2] two'].join('\n'));
    const gh = stubGh();
    expect(runPost(stub, gh).code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(2);
    expect(posted[1].split('\n')[0]).toMatch(
      /^Review gate: codex reviewed [0-9a-f]{9}\.\.[0-9a-f]{9} — 2 findings, not addressed$/
    );
  });

  it('posts and withdraws when a review reported findings AND then was interrupted', () => {
    // Findings come first: a review that found a defect and then hit a blocker
    // has still found a defect, and exiting 2 would leave an already-green gate
    // green over it. It also stops the wrapper aborting on its OWN message when
    // the reviewer's shell output is echoed into the log (Codex, #2115 r5).
    const stub = stubCodex(
      ['codex', '- [P1] one', '', 'Review was interrupted', 'codex exit=2'].join('\n')
    );
    const gh = stubGh();
    const r = runPost(stub, gh);
    expect(r.code).toBe(1);
    const posted = bodies(gh.calls);
    expect(posted).toHaveLength(2);
    expect(posted[0]).toMatch(/^Codex findings for /);
    expect(posted[1].split('\n')[0]).toMatch(/— 1 findings, not addressed$/);
  });

  it('still exits 2 on an interrupted review that reported NO findings', () => {
    const stub = stubCodex(['codex', 'Reviewing...', 'Review was interrupted'].join('\n'));
    const gh = stubGh();
    const r = runPost(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('GATE DID NOT RUN');
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('exits 2 when the withdrawal could not be posted, even though the findings were', () => {
    const stub = stubCodex(['codex', '- [P1] one'].join('\n'));
    const gh = stubGh({ secondCommentExit: 1 });
    const r = runPost(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('could NOT be withdrawn');
    expect(bodies(gh.calls)).toHaveLength(2);
  });

  it('counts N from its own earlier findings comments, not from a typed number', () => {
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh({
      prior: 'Codex findings for abc123456 (not gate evidence):\n\n- [P1] one\n- [P3] two\n',
    });
    expect(runPost(stub, gh).code).toBe(0);
    expect(bodies(gh.calls)[0]).toMatch(
      /^Review gate: codex reviewed \S+ — 2 findings, all addressed\n/
    );
  });

  it('exits 2 when the prior-findings lookup fails, instead of posting "no findings"', () => {
    // A failed lookup returns an empty history, which reads as "there were
    // never any findings" — the one direction this must never fail in
    // (Codex review of #2115, round 2).
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh({ commentsExit: 1, prior: '- [P1] one\n' });
    const r = runPost(stub, gh);
    expect(r.code).toBe(2);
    expect(bodies(gh.calls)).toEqual([]);
  });

  it('exits 2 when the findings comment could not be posted', () => {
    // A dropped findings comment is not cosmetic: the next clean run counts N
    // from these comments, so the evidence would say "no findings" for a head
    // that had them (Codex review of #2115, P2).
    const stub = stubCodex('codex\n- [P2] Something is wrong');
    const gh = stubGh({ commentExit: 1 });
    const r = runPost(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it('exits 2 when the review was clean but the evidence did NOT get posted', () => {
    // Without this the wrapper falls through to exit 0 and the agent reports a
    // gate that nothing recorded — the exact hole the poster exists to close.
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh({ commentExit: 1 });
    const r = runPost(stub, gh);
    expect(r.code).toBe(2);
    expect(r.out).toContain('NOT posted');
  });

  it('treats a pnpm-forwarded `--` as a flag, not as the base ref', () => {
    // `pnpm qa:codex-review -- --post` hands the script a bare `--`; indexing
    // $1 made that the base ref and `git rev-parse --` decided the run.
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh();
    expect(runPost(stub, gh, ['--', '--post']).code).toBe(0);
    const args = readFileSync(stub.args, 'utf8').trimEnd().split('\n');
    expect(args.slice(0, 3)).toEqual(['review', '--base', 'origin/main']);
    expect(args[2]).not.toBe('--');
  });

  it('without --post it writes nothing to the PR', () => {
    const stub = stubCodex('codex\nNo actionable defects found.');
    const gh = stubGh();
    expect(
      execFileSync('bash', [SCRIPT, 'HEAD'], {
        encoding: 'utf8',
        env: { ...process.env, CODEX_BIN: stub.bin, CODEX_REVIEW_LOG: stub.log, GH_BIN: gh.bin },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    ).toContain('post-review-gate.sh');
    expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
  });

  it('always reviews the branch against a base, never a single commit', () => {
    // Wiring assertion on source text is fair here: deleting --base deletes
    // the string. A stub that records its argv would prove the same thing.
    const src = readFileSync(SCRIPT, 'utf8')
      .split('\n')
      .filter(line => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(src).toMatch(/review --base "\$BASE_REF"/);
    expect(src).not.toMatch(/--commit/);
  });
});
