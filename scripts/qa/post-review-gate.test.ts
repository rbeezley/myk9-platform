import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The poster is the ONLY writer of `Review gate:` evidence comments, so it gets
 * a behavioural test with a stub `gh`: we assert what it posts and, more
 * importantly, what it refuses to post. Grepping its source for the guard
 * phrases would prove someone typed them, not that they bite.
 *
 * OBSERVATION, not a diagnosed bug (fallback review of #2243, S4): under heavy
 * machine load this suite has been seen to red nondeterministically, a
 * different random subset each time, including `exit 127` from inside the
 * script. Each case passed deterministically when driven directly (60/60), and
 * once the machine quieted the suite went 3/3 green and 4 concurrent copies
 * 4/4 green, so it could not be reproduced on demand. Every test here spawns
 * bash plus up to two `node --experimental-strip-types` probes, so process
 * contention is the suspect. Recorded here so the next person to see a random
 * red checks load before theorising about a rule.
 */
const SCRIPT = resolve(import.meta.dirname, 'post-review-gate.sh');
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function stubGh(): { bin: string; calls: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gh-stub-'));
  dirs.push(dir);
  const calls = join(dir, 'calls.log');
  const bin = join(dir, 'gh');
  writeFileSync(
    bin,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> '${calls}'\nprintf -- '---\\n' >> '${calls}'\n`
  );
  chmodSync(bin, 0o755);
  return { bin, calls };
}
function logFile(text: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'review-log-'));
  dirs.push(dir);
  const p = join(dir, 'review.log');
  writeFileSync(p, text);
  return p;
}
function run(
  args: string[],
  gh: string,
  env: Record<string, string> = {},
  cwd?: string
): { code: number; out: string } {
  try {
    return {
      code: 0,
      out: execFileSync('bash', [SCRIPT, ...args], {
        encoding: 'utf8',
        cwd,
        env: { ...process.env, ...env, GH_BIN: gh },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: `${err.stdout}${err.stderr}` };
  }
}

describe('post-review-gate.sh', () => {
  it('posts the evidence line first, then the log hash, then the verdict block', () => {
    const gh = stubGh();
    const log = logFile('codex\nNo actionable defects found.\n');
    expect(run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(0);
    const calls = readFileSync(gh.calls, 'utf8');
    expect(calls).toMatch(/^pr\ncomment\n42\n--body\n/);
    const body = calls.split('--body\n')[1]!.split('\n---')[0]!;
    const lines = body.split('\n');
    expect(lines[0]).toBe('Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings');
    expect(lines[1]).toMatch(/^log sha256: [0-9a-f]{64}$/);
    expect(body).toContain('No actionable defects found.');
  });

  it.each(['no blocking findings', '1 finding(s), all addressed', 'no findings yet'])(
    'refuses %j (rejected by review-gate.ts verdictAccepted) and posts nothing',
    verdict => {
      const gh = stubGh();
      const log = logFile('codex\nNo actionable defects found.\n');
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', verdict, log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toContain('verdict');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts exactly what review-gate.ts accepts (grammar is shared, not copied)', () => {
    const gh = stubGh();
    const log = logFile('codex\nNo actionable defects found on the re-run.\n');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all fixed', log], gh.bin).code
    ).toBe(0);
  });

  it('refuses "N findings, all addressed" over a log that still carries findings or lacks the contract sentence', () => {
    for (const text of ['codex\n- [P1] Something is broken\n', 'Both findings were addressed.\n']) {
      const gh = stubGh();
      const log = logFile(text);
      const r = run(
        ['42', 'codex', '0a2020c7a', '5af9af158', '2 findings, all addressed', log],
        gh.bin
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/log does not support/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  });

  it('refuses an empty log', () => {
    const gh = stubGh();
    const log = logFile('');
    expect(
      run(['42', 'claude', '0a2020c7a', '5af9af158', '2 findings, all addressed', log], gh.bin).code
    ).toBe(2);
  });

  it.each([
    'codex\nUnable to complete the review because the connection failed.\n',
    "ERROR: You've hit your usage limit\nReview was interrupted\n",
    'codex\n- [P1] Something is broken\n',
    'codex\n' +
      '- `supabase/migrations/20260907150000_add_missing_fk_leading_indexes.sql:10` — [P2] `set lock_timeout` is session-scoped, not `set local`.' +
      '\n',
    `codex\n- [P1] a real finding\n\n${Array.from({ length: 6000 }, (_, i) => `- checked file ${i}: ${'x'.repeat(40)}`).join('\n')}\n`,
    'codex\n- **[P1]** Something is broken (bold brackets, as Claude writes them)\n',
    'No findings yet; only the workflow file has been inspected.\n',
    // Opens "No actionable" but asserts no VERDICT is available — the opposite
    // of a clean review (Codex review of #2115, P2).
    'No actionable verdict is available; only one file has been inspected.\n',
    'No issues found in this diff.\n',
    'Summary of changes.\n\nNo actionable defects found.\n',
  ])(
    'refuses "no findings" over a log that did not complete or still carries findings: %j',
    text => {
      const gh = stubGh();
      const log = logFile(text);
      const r = run(['42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/log does not support/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    }
  );

  it('accepts "no findings" only when the first paragraph carries the contract sentence', () => {
    const gh = stubGh();
    for (const text of [
      'codex\nNo actionable defects found.\n',
      'No actionable correctness, security, or data-flow regressions were found. Tests pass.\n',
      'The change is small. No actionable issues found.\n',
    ]) {
      const log = logFile(text);
      expect(run(['42', 'claude', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(
        0
      );
    }
  });

  describe('--withdraw', () => {
    // A findings comment is invisible to review-gate.ts, so a second review of
    // a head that already carries clean evidence would leave the gate green
    // over defects just reported (Codex review of #2115, round 3). Withdrawal
    // writes an evidence line the checker REJECTS — it can only add red.
    const FINDINGS = 'codex\n- [P1] Something is broken\n- [P2] And another\n';

    it('posts an evidence line the checker rejects', () => {
      const gh = stubGh();
      const log = logFile(FINDINGS);
      const r = run(
        ['--withdraw', '42', 'codex', '0a2020c7a', '5af9af158', '2 findings, not addressed', log],
        gh.bin
      );
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      expect(body.split('\n')[0]).toBe(
        'Review gate: codex reviewed 0a2020c7a..5af9af158 — 2 findings, not addressed'
      );
      expect(body).toContain('[P1] Something is broken');
    });

    it('withdraws from an INCOMPLETE review that still found a defect', () => {
      // A review that found a defect and then hit a blocker has still found a
      // defect. Refusing this withdrawal leaves the earlier clean attestation
      // standing over a head now known to be broken (Codex, #2115 round 4).
      const gh = stubGh();
      const log = logFile(
        'codex\n- [P1] Something is broken\n\nUnable to complete the review because the connection failed.\n'
      );
      const r = run(
        ['--withdraw', '42', 'codex', '0a2020c7a', '5af9af158', '1 findings, not addressed', log],
        gh.bin
      );
      expect(r.code).toBe(0);
      expect(readFileSync(gh.calls, 'utf8')).toContain('1 findings, not addressed');
    });

    it('refuses to withdraw with a CLEAN verdict — that would post evidence, not remove it', () => {
      const gh = stubGh();
      const log = logFile(FINDINGS);
      const r = run(
        ['--withdraw', '42', 'codex', '0a2020c7a', '5af9af158', 'no findings', log],
        gh.bin
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/cannot withdraw/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses to withdraw over a log with no findings in it', () => {
      const gh = stubGh();
      const log = logFile('codex\nNo actionable defects found.\n');
      const r = run(
        ['--withdraw', '42', 'codex', '0a2020c7a', '5af9af158', '2 findings, not addressed', log],
        gh.bin
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/no \[P\*\] bullets/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // Round 2 finding: owner/none are log-exempt for CLEAN posts (no review
    // ran by definition), but a WITHDRAWAL is an assertion of findings, not
    // a clean post — the exemption must not carry over. Before this fix,
    // `--withdraw none ... /dev/null` posted with exit 0 and no evidence at
    // all: any trusted COLLABORATOR could red-flag a head nothing objected
    // to. Proven both directions: no log is refused, a genuine log with real
    // [P*] bullets is accepted.
    // owner also needs its env-var contract even to withdraw (the withdrawal
    // body still carries the Override reason / Deferred re-review lines).
    // Annotate the return type: the two ternary arms have different keys, so
    // the inferred union carries optional-`undefined` properties that no longer
    // satisfy `Record<string, string>` (MYK9-540).
    const withdrawEnv = (reviewer: string): Record<string, string> =>
      reviewer === 'owner'
        ? { OVERRIDE_REASON: 'Codex unavailable — usage limit', DEFERRED_REVIEW: 'MYK9-523' }
        : {};

    it.each(['none', 'owner'])(
      'refuses to withdraw the %s tier over /dev/null (no evidence of findings)',
      reviewer => {
        const gh = stubGh();
        const r = run(
          [
            '--withdraw',
            '42',
            reviewer,
            '0a2020c7a',
            '5af9af158',
            '1 finding, not addressed',
            '/dev/null',
          ],
          gh.bin,
          withdrawEnv(reviewer)
        );
        expect(r.code).toBe(2);
        expect(r.out).toMatch(/empty or missing/);
        expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
      }
    );

    it.each(['none', 'owner'])(
      'refuses to withdraw the %s tier over a non-empty log with NO [P*] bullets',
      reviewer => {
        // Distinguishes the bullets-check from the empty-log check above: a
        // non-empty log that still carries no evidence of a finding must be
        // refused too, for every tier, not just codex/claude/adversarial.
        const gh = stubGh();
        const log = logFile('Nothing in particular to report.\n');
        const r = run(
          ['--withdraw', '42', reviewer, '0a2020c7a', '5af9af158', '1 finding, not addressed', log],
          gh.bin,
          withdrawEnv(reviewer)
        );
        expect(r.code).toBe(2);
        expect(r.out).toMatch(/no \[P\*\] bullets/);
        expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
      }
    );

    it.each(['none', 'owner'])(
      'withdraws the %s tier when the log genuinely carries [P*] bullets',
      reviewer => {
        const gh = stubGh();
        const log = logFile('- [P1] A real defect was found after all\n');
        const r = run(
          ['--withdraw', '42', reviewer, '0a2020c7a', '5af9af158', '1 finding, not addressed', log],
          gh.bin,
          withdrawEnv(reviewer)
        );
        expect(r.code).toBe(0);
        const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
        expect(body).toContain('[P1] A real defect was found after all');
      }
    );
  });

  it('reads a marker-less (claude -p) log in full, so a long clean review keeps its opening sentence', () => {
    const gh = stubGh();
    const long = `No actionable defects found.\n\n${Array.from({ length: 60 }, (_, i) => `- checked file ${i}`).join('\n')}\n`;
    const log = logFile(long);
    expect(run(['42', 'claude', '0a2020c7a', '5af9af158', 'no findings', log], gh.bin).code).toBe(
      0
    );
    expect(readFileSync(gh.calls, 'utf8')).toContain('checked file 59');
  });

  describe('owner tier', () => {
    // The critical fix: `owner` has no review log by definition, so its
    // content must never be required to LOOK like a completed review. Before
    // this fix, the only log this suite fed the owner path was
    // logFile('No actionable defects found.\n') — a fabricated clean-review
    // sentence describing a review that never ran. That is the workaround
    // this fix removes; these tests now use an HONEST log describing why no
    // review happened, and prove it posts (it used to be refused).
    const HONEST_LOG = 'Codex was unavailable — usage limit reached. No review was run.\n';
    const OWNER_ENV = {
      OVERRIDE_REASON: 'Codex unavailable — usage limit',
      DEFERRED_REVIEW: 'MYK9-523',
    };

    it('posts an HONEST "no review ran" log, with Override reason and Deferred re-review as the 2nd and 3rd lines', () => {
      const gh = stubGh();
      const log = logFile(HONEST_LOG);
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', log],
        gh.bin,
        OWNER_ENV
      );
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      const lines = body.split('\n');
      expect(lines[0]).toBe(
        'Review gate: owner reviewed 0a2020c7a..5af9af158 — override, floor was independent'
      );
      expect(lines[1]).toBe('Override reason: Codex unavailable — usage limit');
      expect(lines[2]).toBe('Deferred re-review: MYK9-523');
      expect(lines[3]).toMatch(/^log sha256: [0-9a-f]{64}$/);
      expect(body).toContain(HONEST_LOG.trim());
    });

    it('posts with NO log at all (/dev/null) — owner never requires a log', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        OWNER_ENV
      );
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      expect(body.split('\n')[3]).toBe('log sha256: n/a');
    });

    it('refuses without OVERRIDE_REASON and posts nothing', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { DEFERRED_REVIEW: 'MYK9-523' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toContain('OVERRIDE_REASON');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses without DEFERRED_REVIEW and posts nothing', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: 'Codex unavailable — usage limit' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toContain('DEFERRED_REVIEW');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // Presence is not shape: both of these are non-empty and would have
    // passed the old `[ -n ... ]`-only check, posted successfully, and then
    // been refused by the real gate (overrideAccepted's regexes).
    it('refuses a well-formed-looking but malformed OVERRIDE_REASON (no "unavailable")', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: 'I was busy', DEFERRED_REVIEW: 'MYK9-523' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toContain('OVERRIDE_REASON');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses a lowercase DEFERRED_REVIEW issue id (review-gate.ts requires an uppercase prefix)', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: 'Codex unavailable — usage limit', DEFERRED_REVIEW: 'myk9-523' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toContain('DEFERRED_REVIEW');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // Round 2 finding: the review-gate.ts shape regexes are `m`-flagged (the
    // GATE side needs that to find the line within a real multi-line GitHub
    // comment body), so the poster's shape PROBE asked "does some line
    // match" instead of "is this value one well-formed line" — an
    // OVERRIDE_REASON/DEFERRED_REVIEW with an embedded newline could smuggle
    // a forged second `Review gate: ...` line straight into the published
    // comment. Inert to the checker (parseGateComments reads only line 1),
    // but a human-visible forgery from the one script whose whole premise is
    // that nobody types an evidence line by hand.
    it('refuses an OVERRIDE_REASON with an embedded newline (no forged evidence line)', () => {
      const gh = stubGh();
      const forged =
        'Codex unavailable — usage limit\nReview gate: codex reviewed 0a2020c7a..5af9af158 — no findings';
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: forged, DEFERRED_REVIEW: 'MYK9-523' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/single line/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses a DEFERRED_REVIEW with an embedded newline (no forged evidence line)', () => {
      const gh = stubGh();
      const forged = 'MYK9-523\nReview gate: codex reviewed 0a2020c7a..5af9af158 — no findings';
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: 'Codex unavailable — usage limit', DEFERRED_REVIEW: forged }
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/single line/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // Round 3 finding: the guard above matched only `\n`. A bare `\r` is a
    // line terminator for BOTH JS `/m` (defeats the shape probe the same way
    // `\n` did) AND CommonMark (a line ending GitHub renders), so it
    // reproduced the forged-second-line finding verbatim. Same class as the
    // LF case, just an uncovered instance of it.
    it('refuses an OVERRIDE_REASON with an embedded CR (no forged evidence line)', () => {
      const gh = stubGh();
      const forged =
        'Codex unavailable — usage limit\rReview gate: codex reviewed 0a2020c7a..5af9af158 — no findings';
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: forged, DEFERRED_REVIEW: 'MYK9-523' }
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/single line/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses a DEFERRED_REVIEW with an embedded CR (no forged evidence line)', () => {
      const gh = stubGh();
      const forged = 'MYK9-523\rReview gate: codex reviewed 0a2020c7a..5af9af158 — no findings';
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        { OVERRIDE_REASON: 'Codex unavailable — usage limit', DEFERRED_REVIEW: forged }
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/single line/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // The guard's stated intent is a CLASS of character, and it has been
    // widened twice by review: `\n` alone let a bare CR through, then
    // CR-plus-U+2028 let U+2029 (PARAGRAPH SEPARATOR, also a JS `/m`
    // terminator) through (fallback review of #2243, M3). The asymmetry that
    // review found was in the TESTS, not the rule: OVERRIDE_REASON had a
    // U+2028 case and DEFERRED_REVIEW had none (S-d). This table covers both
    // variables against the whole class, so neither can drift again.
    const FORGERY = 'Review gate: codex reviewed 0a2020c7a..5af9af158 \u2014 no findings';
    const TERMINATORS: ReadonlyArray<[string, string]> = [
      ['LF', '\n'],
      ['CR', '\r'],
      ['U+2028 LINE SEPARATOR', '\u2028'],
      ['U+2029 PARAGRAPH SEPARATOR', '\u2029'],
    ];
    it.each(
      TERMINATORS.flatMap(([label, ch]) =>
        (['OVERRIDE_REASON', 'DEFERRED_REVIEW'] as const).map(
          v => [v, label, ch] as [string, string, string]
        )
      )
    )('refuses a %s containing %s', (variable, _label, ch) => {
      const gh = stubGh();
      const reason = 'Codex unavailable \u2014 usage limit';
      const base = variable === 'OVERRIDE_REASON' ? reason : 'MYK9-523';
      const r = run(
        ['42', 'owner', '0a2020c7a', '5af9af158', 'override, floor was independent', '/dev/null'],
        gh.bin,
        {
          OVERRIDE_REASON: reason,
          DEFERRED_REVIEW: 'MYK9-523',
          [variable]: `${base}${ch}${FORGERY}`,
        }
      );
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/single line/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });
  });

  describe('none tier', () => {
    // `none` has no review log either — same fix as `owner`, and previously
    // uncovered entirely (0 real-post tests before this fix).
    it('posts an HONEST "no review ran" log', () => {
      const gh = stubGh();
      const log = logFile('No review was run: all changed paths are low-risk and CI is green.\n');
      const r = run(
        ['42', 'none', '0a2020c7a', '5af9af158', 'low-risk paths, CI green', log],
        gh.bin
      );
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      expect(body.split('\n')[0]).toBe(
        'Review gate: none reviewed 0a2020c7a..5af9af158 — low-risk paths, CI green'
      );
      expect(body).toContain('all changed paths are low-risk');
    });

    it('posts with NO log at all (/dev/null) — none never requires a log', () => {
      const gh = stubGh();
      const r = run(
        ['42', 'none', '0a2020c7a', '5af9af158', 'low-risk paths, CI green', '/dev/null'],
        gh.bin
      );
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      expect(body.split('\n')[1]).toBe('log sha256: n/a');
    });
  });

  describe('reviewer tier validation (POST_REVIEW_GATE_DRY_RUN)', () => {
    // Each reviewer's own tier grammar (scripts/qa/review-gate.ts
    // VERDICT_BY_TIER) — not the stale "no findings for every tier" shape,
    // which cannot pass once the poster binds the verdict to the tier.
    const VERDICT_BY_REVIEWER: Record<string, string> = {
      codex: 'no findings',
      claude: 'no findings',
      adversarial: '2 lenses, all findings addressed',
      none: 'low-risk paths, CI green',
      owner: 'override, floor was independent',
    };

    function dryRun(args: string[], env: Record<string, string> = {}): number {
      try {
        execFileSync('bash', [SCRIPT, ...args], {
          encoding: 'utf8',
          env: { ...process.env, ...env, GH_BIN: 'true', POST_REVIEW_GATE_DRY_RUN: '1' },
        });
        return 0;
      } catch (e) {
        return (e as { status: number }).status;
      }
    }

    // NOT "every tier the gate can parse": the gate's REVIEWER_TOKENS also
    // carries `independent/codex` and `independent/claude`, and the poster
    // refuses both (fail-closed, deliberate). `human-fallback` used to be a
    // third refused-but-parseable token; MYK9-532 retired it from
    // REVIEWER_TOKENS entirely, so it is refused for the same reason as any
    // unrecognized string now. This covers the five tokens the poster is
    // allowed to WRITE.
    it('accepts every reviewer token the poster is allowed to write', () => {
      for (const [reviewer, verdict] of Object.entries(VERDICT_BY_REVIEWER)) {
        const env: Record<string, string> =
          reviewer === 'owner'
            ? { OVERRIDE_REASON: 'Codex unavailable — usage limit', DEFERRED_REVIEW: 'MYK9-523' }
            : reviewer === 'adversarial'
              ? { REVIEW_LENSES: 'correctness\nsecurity' }
              : {};
        expect(
          dryRun(['1', reviewer, 'abc1234', 'def5678', verdict, '/dev/null'], env),
          reviewer
        ).not.toBe(2);
      }
    });

    // Exit 2 alone does NOT pin this rule: the verdict-grammar path returns 2
    // as well, so deleting the whole `case` allowlist left this green
    // (fallback review of #2243, S-a). `independent/codex` is a valid
    // gate-side ReviewerToken, so the verdict path cannot refuse it — only
    // the allowlist can, and only by this message. `human-fallback` is kept
    // in the table as a regression: MYK9-532 retired it from the gate's own
    // REVIEWER_TOKENS, and this proves the poster still refuses it by name
    // rather than accidentally minting a line the gate no longer parses.
    it.each(['wishful', 'human-fallback', 'independent/codex', 'independent/claude'])(
      'refuses the reviewer token %s by name, not merely with exit 2',
      reviewer => {
        const gh = stubGh();
        const r = run(['1', reviewer, 'abc1234', 'def5678', 'no findings', '/dev/null'], gh.bin);
        expect(r.code).toBe(2);
        expect(r.out).toMatch(/reviewer must be codex, claude, adversarial, none or owner/);
        expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
      }
    );

    it('refuses the owner tier without a deferred re-review', () => {
      expect(
        dryRun(
          ['1', 'owner', 'abc1234', 'def5678', 'override, floor was independent', '/dev/null'],
          { OVERRIDE_REASON: 'Codex unavailable — usage limit' }
        )
      ).toBe(2);
    });

    it('refuses the owner tier without an override reason', () => {
      expect(
        dryRun(
          ['1', 'owner', 'abc1234', 'def5678', 'override, floor was independent', '/dev/null'],
          { DEFERRED_REVIEW: 'MYK9-523' }
        )
      ).toBe(2);
    });

    it('never calls gh in dry-run mode, even for an accepted tier', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gh-must-not-run-'));
      dirs.push(dir);
      const marker = join(dir, 'called');
      const bin = join(dir, 'gh');
      writeFileSync(bin, `#!/usr/bin/env bash\ntouch '${marker}'\n`);
      chmodSync(bin, 0o755);
      const code = (() => {
        try {
          execFileSync(
            'bash',
            [SCRIPT, '1', 'codex', 'abc1234', 'def5678', 'no findings', '/dev/null'],
            {
              encoding: 'utf8',
              env: { ...process.env, GH_BIN: bin, POST_REVIEW_GATE_DRY_RUN: '1' },
            }
          );
          return 0;
        } catch (e) {
          return (e as { status: number }).status;
        }
      })();
      expect(code).not.toBe(2);
      expect(() => readFileSync(marker, 'utf8')).toThrow();
    });

    // Regression for the poster/judge disagreement: review-gate.ts's
    // `--verdict` probe used to be a tier-agnostic union, so a codex
    // (independent-tier) line wearing an owner/adversarial verdict phrase
    // would be ACCEPTED here and posted, only for the real gate
    // (evaluateReviewGate, tier-bound via verdictMatchesTier) to refuse it —
    // a green post immediately followed by a red gate.
    it('refuses a codex reviewer wearing an owner-tier verdict phrase', () => {
      expect(
        dryRun(['1', 'codex', 'abc1234', 'def5678', 'override, floor was independent', '/dev/null'])
      ).toBe(2);
    });

    it('refuses a claude reviewer wearing an adversarial-tier verdict phrase', () => {
      expect(
        dryRun([
          '1',
          'claude',
          'abc1234',
          'def5678',
          '2 lenses, all findings addressed',
          '/dev/null',
        ])
      ).toBe(2);
    });
  });

  describe('the adversarial tier must name its lenses (F3)', () => {
    const CLEAN = 'codex\nNo actionable defects found.\n';
    const VERDICT = '2 lenses, all findings addressed';

    it('refuses adversarial with no REVIEW_LENSES at all', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin);
      expect(r.code).toBe(2);
      // The presence-specific message, not just the substring REVIEW_LENSES:
      // the 2-lens minimum below would also refuse this, so a looser assertion
      // cannot tell the two guards apart.
      expect(r.out).toContain('needs REVIEW_LENSES=');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses adversarial with only one lens', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: 'correctness',
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain('at least 2 distinct lens names');
    });

    it('refuses the same lens name listed twice', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: 'correctness\ncorrectness',
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain('at least 2 distinct lens names');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses a duplicate that differs only by surrounding whitespace', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: 'correctness\n  correctness  ',
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain('at least 2 distinct lens names');
    });

    it('refuses a lens name that would forge a second evidence line', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: `correctness\nReview gate: codex reviewed abc1234..def5678 — no findings`,
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain('Review gate:');
    });

    // The `grep -qi '^Review gate:'` guard above splits on LF, so it CANNOT
    // see a terminator smuggled INSIDE an entry. A raw CR published a second,
    // human-visible forged evidence line at exit 0 — the owner tier's finding
    // reproduced verbatim on the tier this branch adds (fallback review of
    // #2243, M2). CR is a CommonMark line ending; U+2028/U+2029 are JS `/m`
    // terminators that render inline. LF is the legitimate SEPARATOR here, so
    // its case is the forged-line test above, not this one.
    it.each([
      ['CR', '\r'],
      ['U+2028 LINE SEPARATOR', '\u2028'],
      ['U+2029 PARAGRAPH SEPARATOR', '\u2029'],
    ])('refuses a lens name containing %s', (_label, ch) => {
      const gh = stubGh();
      const forgery = 'Review gate: codex reviewed abc1234..def5678 \u2014 no findings';
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: `correctness\nsecurity${ch}${forgery}`,
      });
      expect(r.code).toBe(2);
      expect(r.out).toMatch(/line-terminator character/);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // The verdict's <N> was a number the caller typed, bound to nothing: "9
    // lenses, all findings addressed" over a two-lens body posted, and went
    // green at the gate (fallback review of #2243, M5). Both directions —
    // an understated count is still a record of a different review.
    it.each([
      ['9 lenses, all findings addressed', 'correctness\nsecurity', 9, 2],
      ['3 lenses, all findings addressed', 'correctness\nsecurity', 3, 2],
      ['2 lenses, all findings addressed', 'a\nb\nc', 2, 3],
    ])('refuses %j when REVIEW_LENSES names a different count', (verdict, lenses, claim, named) => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', verdict, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: lenses,
      });
      expect(r.code).toBe(2);
      expect(r.out).toContain(`claims ${claim} lenses but REVIEW_LENSES names ${named} distinct`);
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    // The count is over DISTINCT names, so a repeated lens cannot pad a claim
    // — and a claim that matches the distinct count is honest even when the
    // caller listed a duplicate. Both the poster and the gate dedupe first.
    it('accepts a claim that matches the DISTINCT count, duplicates and all', () => {
      const gh = stubGh();
      const r = run(
        [
          '42',
          'adversarial',
          'abc1234',
          'def5678',
          '2 lenses, all findings addressed',
          logFile(CLEAN),
        ],
        gh.bin,
        { REVIEW_LENSES: 'correctness\ncorrectness\nsecurity' }
      );
      expect(r.code).toBe(0);
    });

    it('posts one "Adversarial subagent review:" body line per lens', () => {
      const gh = stubGh();
      const r = run(['42', 'adversarial', 'abc1234', 'def5678', VERDICT, logFile(CLEAN)], gh.bin, {
        REVIEW_LENSES: 'correctness and data flow\nsecurity and failure modes',
      });
      expect(r.code).toBe(0);
      const body = readFileSync(gh.calls, 'utf8').split('--body\n')[1]!.split('\n---')[0]!;
      const lines = body.split('\n');
      expect(lines[0]).toBe(`Review gate: adversarial reviewed abc1234..def5678 — ${VERDICT}`);
      expect(lines[1]).toBe('Adversarial subagent review: correctness and data flow');
      expect(lines[2]).toBe('Adversarial subagent review: security and failure modes');
      expect(lines[3]).toMatch(/^log sha256: [0-9a-f]{64}$/);
    });

    describe('against a real diff that touches supabase/migrations/', () => {
      function migrationRepo(): { dir: string; base: string; head: string } {
        const dir = mkdtempSync(join(tmpdir(), 'migration-repo-'));
        dirs.push(dir);
        const git = (...args: string[]) =>
          execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
        git('init', '-q', '-b', 'main');
        git('config', 'user.email', 'test@example.com');
        git('config', 'user.name', 'test');
        writeFileSync(join(dir, 'README.md'), 'base\n');
        git('add', '-A');
        git('commit', '-qm', 'base');
        const base = git('rev-parse', 'HEAD');
        execFileSync('mkdir', ['-p', join(dir, 'supabase', 'migrations')]);
        writeFileSync(join(dir, 'supabase/migrations/20260914174500_x.sql'), 'select 1;\n');
        git('add', '-A');
        git('commit', '-qm', 'migration');
        return { dir, base, head: git('rev-parse', 'HEAD') };
      }

      it('refuses lenses that omit migration-auditor', () => {
        const gh = stubGh();
        const repo = migrationRepo();
        const r = run(
          ['42', 'adversarial', repo.base, repo.head, VERDICT, logFile(CLEAN)],
          gh.bin,
          { REVIEW_LENSES: 'correctness\nsecurity' },
          repo.dir
        );
        expect(r.code).toBe(2);
        expect(r.out).toContain('migration-auditor');
        expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
      });

      it('accepts the same post once migration-auditor is one of the lenses', () => {
        const gh = stubGh();
        const repo = migrationRepo();
        const r = run(
          ['42', 'adversarial', repo.base, repo.head, VERDICT, logFile(CLEAN)],
          gh.bin,
          { REVIEW_LENSES: 'migration-auditor\nsecurity' },
          repo.dir
        );
        expect(r.code).toBe(0);
        expect(readFileSync(gh.calls, 'utf8')).toContain(
          'Adversarial subagent review: migration-auditor'
        );
      });
    });
  });

  describe('a clean none/owner post over a findings-laden log (F8)', () => {
    // The log stays OPTIONAL for none/owner — that exemption is what lets an
    // honest "no review ran" note be posted instead of a fabricated "No
    // actionable findings" sentence, and it must NOT be undone. What is
    // refused is narrower: a log that carries [P*] bullets under a verdict
    // saying nobody needed to look.
    const OWNER_ENV = {
      OVERRIDE_REASON: 'Codex unavailable — usage limit',
      DEFERRED_REVIEW: 'MYK9-523',
    };

    it('still posts `none` with no log at all', () => {
      const gh = stubGh();
      expect(
        run(['42', 'none', 'abc1234', 'def5678', 'low-risk paths, CI green', '/dev/null'], gh.bin)
          .code
      ).toBe(0);
    });

    it('still posts `owner` with an HONEST log that names no findings', () => {
      const gh = stubGh();
      const log = logFile('Codex unavailable, no review was run.\n');
      const r = run(
        ['42', 'owner', 'abc1234', 'def5678', 'override, floor was independent', log],
        gh.bin,
        OWNER_ENV
      );
      expect(r.code).toBe(0);
      expect(readFileSync(gh.calls, 'utf8')).toContain('Codex unavailable, no review was run.');
    });

    it('refuses a `none` post whose log carries [P*] bullets', () => {
      const gh = stubGh();
      const log = logFile('review\n\n- [P1] something bad\n');
      const r = run(['42', 'none', 'abc1234', 'def5678', 'low-risk paths, CI green', log], gh.bin);
      expect(r.code).toBe(2);
      expect(r.out).toContain('[P*] bullets');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });

    it('refuses an `owner` override whose log carries [P*] bullets', () => {
      const gh = stubGh();
      const log = logFile('review\n\n- [P1] something bad\n');
      const r = run(
        ['42', 'owner', 'abc1234', 'def5678', 'override, floor was independent', log],
        gh.bin,
        OWNER_ENV
      );
      expect(r.code).toBe(2);
      expect(r.out).toContain('[P*] bullets');
      expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
    });
  });
});

/**
 * S-c of the fallback review of #2243: the poster published an `owner`
 * override whose claimed floor the gate then refused — the one direction in
 * which the poster was LOOSER than the judge, in a file whose own comments say
 * the two sides were made to agree ("the poster and the judge disagreeing is
 * how a confusing red gate happens"). It fails closed, so this is record
 * hygiene, not a bypass — but the claimed floor IS the debt record.
 */
describe("the owner override's claimed floor is checked against the real one", () => {
  function repoWith(files: readonly string[]): { dir: string; base: string; head: string } {
    const dir = mkdtempSync(join(tmpdir(), 'floor-repo-'));
    dirs.push(dir);
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    writeFileSync(join(dir, 'README.md'), 'base\n');
    git('add', '-A');
    git('commit', '-qm', 'base');
    const base = git('rev-parse', 'HEAD');
    for (const file of files) {
      const full = join(dir, file);
      execFileSync('mkdir', ['-p', resolve(full, '..')]);
      writeFileSync(full, 'x\n');
    }
    git('add', '-A');
    git('commit', '-qm', 'change');
    return { dir, base, head: git('rev-parse', 'HEAD') };
  }
  const ENV = {
    OVERRIDE_REASON: 'Codex unavailable \u2014 usage limit',
    DEFERRED_REVIEW: 'MYK9-523',
  };

  it('refuses "floor was adversarial" on a guardrail diff (real floor: independent)', () => {
    const gh = stubGh();
    const repo = repoWith(['scripts/qa/review-gate.ts']);
    const r = run(
      ['42', 'owner', repo.base, repo.head, 'override, floor was adversarial', '/dev/null'],
      gh.bin,
      ENV,
      repo.dir
    );
    expect(r.code).toBe(2);
    expect(r.out).toContain('claims floor was adversarial');
    expect(r.out).toContain('real floor');
    expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
  });

  it('refuses "floor was independent" on a migration diff (real floor: adversarial)', () => {
    const gh = stubGh();
    const repo = repoWith(['supabase/migrations/20260914174500_x.sql']);
    const r = run(
      ['42', 'owner', repo.base, repo.head, 'override, floor was independent', '/dev/null'],
      gh.bin,
      ENV,
      repo.dir
    );
    expect(r.code).toBe(2);
    expect(r.out).toContain('claims floor was independent');
    expect(() => readFileSync(gh.calls, 'utf8')).toThrow();
  });

  it('accepts the claim that matches the real floor', () => {
    const gh = stubGh();
    const repo = repoWith(['scripts/qa/review-gate.ts']);
    const r = run(
      ['42', 'owner', repo.base, repo.head, 'override, floor was independent', '/dev/null'],
      gh.bin,
      ENV,
      repo.dir
    );
    expect(r.code).toBe(0);
    expect(readFileSync(gh.calls, 'utf8')).toContain('override, floor was independent');
  });

  it('does not fire when the SHAs are not resolvable locally', () => {
    // Same fail-open-to-the-gate shape as the migration-lens check: a shallow
    // clone or a fixture must not block a legitimate post, because the gate
    // re-checks the claim against the PR's real file list either way.
    const gh = stubGh();
    const r = run(
      ['42', 'owner', 'abc1234', 'def5678', 'override, floor was adversarial', '/dev/null'],
      gh.bin,
      ENV
    );
    expect(r.code).toBe(0);
  });
});
