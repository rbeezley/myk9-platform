import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clampDescription,
  evaluateReviewGate,
  fileListIsUnusable,
  GH_MAX_BUFFER_BYTES,
  isFullSha,
  runGh,
  flattenPages,
  overrideAccepted,
  OWNER_OVERRIDE_ASSOCIATIONS,
  parseFileNameList,
  parseGateComments,
  runCli,
  REVIEW_GATE_CONTEXT,
  REVIEW_GATE_LINE,
  REST_FILE_PAGE_CAP,
  REVIEWER_TOKENS,
  tierForReviewer,
  TRUSTED_ASSOCIATIONS,
  VERDICT_BY_TIER,
  verdictAccepted,
  type EvaluateReviewGateInput,
  type GateComment,
} from './review-gate';
import { MIGRATION_LENS, requiredTier, TIER_ORDER } from './review-tier';

/**
 * Synthetic SHAs, never real commits. The `runCli` tests below drive the whole
 * CLI including `postStatus`, and the injected `gh` runner is the only thing
 * between this suite and a real `POST repos/<owner>/<repo>/statuses/<sha>`. On
 * 2026-09-15 a review lens reverted that injection and ran the suite: it wrote
 * two real `Review gate: failure` statuses onto a merged commit, and commit
 * statuses cannot be deleted (MYK9-560 item 1). Every fixture here is now a
 * synthetic 40-char hex SHA against the non-existent repo `o/r`, so the blast
 * radius of a future injection regression is zero.
 */
const HEAD = 'a'.repeat(40);
const OLD_HEAD = 'b'.repeat(40);
const H9 = HEAD.slice(0, 9);
/** The repo every `runCli` fixture names. Does not exist; see HEAD above. */
const FAKE_REPO = 'o/r';

/**
 * An `adversarial` evidence body. The tier now requires the lenses be NAMED in
 * the body (F3), so every adversarial fixture carries them; the migration rule
 * is exercised by passing `migration-auditor` as one of them.
 */
function adversarialBody(
  verdict = '2 lenses, all findings addressed',
  lenses: readonly string[] = ['correctness and data flow', 'security and failure modes']
): string {
  return [
    `Review gate: adversarial reviewed abc1234..${HEAD} — ${verdict}`,
    ...lenses.map(lens => `Adversarial subagent review: ${lens}`),
  ].join('\n');
}

/**
 * Index into a list an assertion has already pinned. Under
 * `noUncheckedIndexedAccess` an index read is `T | undefined`; an optional
 * chain would turn a missing element into a SKIPPED expectation, which in this
 * file would silently stop pinning the gate's contract. Throwing keeps the
 * test red and says what was missing (MYK9-540).
 */
function at<T>(items: readonly T[], index: number, what: string): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected ${what} at index ${index}; got ${items.length} item(s)`);
  }
  return item;
}

/** The same rule for a mandatory regex capture group. */
function captured(match: RegExpMatchArray | null, index: number, what: string): string {
  const value = match?.[index];
  if (value === undefined) {
    throw new Error(`expected ${what} (capture group ${index})`);
  }
  return value;
}

function comment(
  body: string,
  createdAt = '2026-09-05T16:00:00Z',
  updatedAt?: string,
  authorAssociation = 'OWNER'
): GateComment {
  return { body, createdAt, updatedAt, author: 'rbeezley', authorAssociation };
}

describe('evaluateReviewGate', () => {
  it('fails with no review recorded at all', () => {
    const r = evaluateReviewGate({ headSha: HEAD, comments: [], changedFiles: [] });
    expect(r.state).toBe('failure');
    expect(r.description).toContain(H9);
  });

  it('fails when the only review is for an EARLIER head (#2040)', () => {
    // The review ran, and it was even clean — but a push moved the head after
    // it. That is the merge-while-review-runs hole: evidence for a previous
    // SHA must not count for this one.
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(`Review gate: codex reviewed 0a2020c7a..${OLD_HEAD.slice(0, 9)} — no findings`),
      ],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toMatch(/no independent review recorded/);
  });

  it('passes on a clean review of the current head', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [comment(`Review gate: codex reviewed 0a2020c7a..${H9} — no findings`)],
    });
    expect(r.state).toBe('success');
    expect(r.evidence?.reviewer).toBe('codex');
    expect(r.description).toContain('no findings');
  });

  it('passes when findings were reported AND addressed', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(`Review gate: claude reviewed 0a2020c7a..${H9} — 2 findings, all addressed`),
      ],
    });
    expect(r.state).toBe('success');
  });

  it('refuses a legacy human-fallback body, naming the owner override as the replacement (MYK9-532)', () => {
    // The exact regression this issue exists to prove: `human-fallback` is
    // retired outright, and the refusal names its replacement rather than
    // failing silently with the generic "no review recorded" message.
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: ['docs/operations/scheduled-task-walks.md'],
      comments: [
        comment(
          [
            `Review gate: human-fallback reviewed 0a2020c7a..${H9} — 2 adversarial subagent reviews, all findings addressed`,
            'Fallback reason: Claude unavailable — authentication failure',
            'Adversarial subagent review: correctness and data flow',
            'Adversarial subagent review: security and migration safety',
            'Required checks: passing',
          ].join('\n')
        ),
      ],
    });
    expect(r.state).toBe('failure');
    // Assert the CLAMPED text: GitHub caps a status description at 140 chars,
    // so a refusal whose grammar hints fall past the cut is invisible exactly
    // where it is read. Asserting `r.description` alone passed while the
    // posted status ended "...override, floor w..." (MYK9-532 review).
    const posted = clampDescription(r.description);
    expect(posted).toContain('human-fallback is retired');
    expect(posted).toContain('owner override');
    expect(posted).toContain('override, floor was <floor>');
    expect(posted).toContain('Override reason:');
    expect(posted).toContain('Deferred re-review:');
    expect(posted).not.toMatch(/\.\.\.$/);
    expect(r.evidence).toBeUndefined();
  });

  it('ignores a human-fallback attempt from an untrusted author — falls through to the generic message', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: ['docs/operations/scheduled-task-walks.md'],
      comments: [
        comment(
          `Review gate: human-fallback reviewed 0a2020c7a..${H9} — 2 adversarial subagent reviews, all findings addressed`,
          undefined,
          undefined,
          'CONTRIBUTOR'
        ),
      ],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toMatch(/no independent review recorded/);
  });

  it('fails when the review did not actually run, even if a line was posted', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(`Review gate: codex reviewed 0a2020c7a..${H9} — GATE DID NOT RUN (usage limit)`),
      ],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toMatch(/not clean/);
  });

  it.each([
    '1 finding unaddressed',
    '2 findings, not all addressed',
    '1 finding, not all fixed',
    'no findings yet; review still running',
    'no findings (pending a second pass)',
    'all addressed',
    'findings, all addressed',
    'no findings, but see below',
    // Tier-bound grammar near-misses (Codex review of Task 3 round 1, C3/I3):
    // fewer than 2 lenses is not adversarial review, and the `none` phrase
    // must be exactly "CI green" — never a substring or a near neighbor.
    // '2 lenses, not all findings addressed' is a regression pin, not
    // mutation evidence — it stays rejected under both the min-count guard
    // AND the (already-correct, pre-task-3) anchoring, so it cannot by
    // itself prove either guard is load-bearing (Codex review of Task 3
    // round 2 process note).
    '0 lenses, all findings addressed',
    '2 lenses, not all findings addressed',
    'low-risk paths, CI red',
    // Zero-padded counts (Codex review of Task 3 round 2, C3): `\d{2,}`
    // matched these because a leading zero is still "two or more digits".
    '00 lenses, all findings addressed',
    '01 lenses, all findings addressed',
  ])('rejects the near-miss verdict %j — the grammar is exact, not substring', verdict => {
    // Codex's review of #2058: a substring check accepted several of these as
    // green. A negation or a qualifier inside the verdict must fail.
    expect(verdictAccepted(verdict)).toBe(false);
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [comment(`Review gate: codex reviewed 0a2020c7a..${H9} — ${verdict}`)],
    });
    expect(r.state).toBe('failure');
  });

  it.each(['no findings', 'No findings.', '1 finding, all addressed', '3 findings, all fixed'])(
    'accepts the exact verdict %j',
    verdict => {
      expect(verdictAccepted(verdict)).toBe(true);
    }
  );

  it('takes the LATEST evidence for the head, so a re-gate after fixes supersedes', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — 1 finding unaddressed`,
          '2026-09-05T16:00:00Z'
        ),
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — 1 finding, all addressed`,
          '2026-09-05T16:20:00Z'
        ),
      ],
    });
    expect(r.state).toBe('success');
  });

  it('an older attestation EDITED to withdraw outranks a newer-created clean one', () => {
    // Codex, #2058 round 3: sorting by creation time let a correction made
    // by editing the earlier comment lose to a later clean comment.
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — 1 finding unaddressed`,
          '2026-09-05T16:00:00Z',
          '2026-09-05T16:30:00Z'
        ),
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — no findings`,
          '2026-09-05T16:20:00Z'
        ),
      ],
    });
    expect(r.state).toBe('failure');
    expect(r.evidence?.verdict).toBe('1 finding unaddressed');
  });

  it.each(['NONE', 'CONTRIBUTOR', 'FIRST_TIMER', 'FIRST_TIME_CONTRIBUTOR', 'MANNEQUIN', ''])(
    'ignores a clean line from an untrusted author (%j) — anyone can comment on a public PR',
    association => {
      // Codex, #2058 P1: the workflow publishes with a write-capable token,
      // so a comment from an outsider must never become a green status.
      const r = evaluateReviewGate({
        headSha: HEAD,
        changedFiles: [],
        comments: [
          comment(
            `Review gate: codex reviewed 0a2020c7a..${H9} — no findings`,
            undefined,
            undefined,
            association
          ),
        ],
      });
      expect(r.state).toBe('failure');
      expect(r.description).toMatch(/no independent review recorded/);
    }
  );

  it.each([...TRUSTED_ASSOCIATIONS])(
    'accepts a clean line from a trusted author (%s)',
    association => {
      const r = evaluateReviewGate({
        headSha: HEAD,
        changedFiles: [],
        comments: [
          comment(
            `Review gate: codex reviewed 0a2020c7a..${H9} — no findings`,
            undefined,
            undefined,
            association
          ),
        ],
      });
      expect(r.state).toBe('success');
    }
  );

  it("an outsider's NEWER clean line cannot outrank a trusted withdrawal", () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — 1 finding unaddressed`,
          '2026-09-05T16:00:00Z'
        ),
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — no findings`,
          '2026-09-05T17:00:00Z',
          undefined,
          'NONE'
        ),
      ],
    });
    expect(r.state).toBe('failure');
  });

  it('ignores the format when it is quoted, indented, or backticked — prose is not evidence', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(`> Review gate: codex reviewed 0a2020c7a..${H9} — no findings`),
        comment(
          `Reminder: post \`Review gate: codex reviewed 0a2020c7a..${H9} — no findings\` when done`
        ),
        comment(`    Review gate: codex reviewed 0a2020c7a..${H9} — no findings`),
      ],
    });
    expect(r.state).toBe('failure');
  });

  it('ignores a head prefix shorter than seven characters', () => {
    expect(
      parseGateComments([
        comment(`Review gate: codex reviewed 0a2020c..${HEAD.slice(0, 6)} — no findings`),
      ])
    ).toEqual([]);
  });

  it('reads only the FIRST line of a comment, and accepts en dash or hyphen', () => {
    // The workflow triggers on comments that START with the evidence line;
    // the parser applies the same rule so a comment that would not trigger a
    // re-evaluation cannot count on the next push either.
    const evidence = parseGateComments([
      comment(
        `Some preamble.\nReview gate: claude reviewed ${OLD_HEAD.slice(0, 7)}..${HEAD.slice(0, 7)} - no findings`
      ),
      comment(
        `Review gate: claude reviewed ${OLD_HEAD.slice(0, 7)}..${HEAD.slice(0, 7)} - no findings\nDetail on later lines is fine.`
      ),
      comment(`Review gate: codex reviewed ${OLD_HEAD}..${HEAD} – 3 findings, all fixed`),
    ]);
    expect(evidence.map(e => e.reviewer)).toEqual(['claude', 'codex']);
    expect(at(evidence, 1, 'the codex gate evidence').head).toBe(HEAD);
  });
});

describe('contract with the ship-pr skill', () => {
  it('the example line the skill documents is machine-valid', () => {
    // The skill tells the agent what to post; this checker decides what
    // counts. If either side drifts, the gate goes red on every PR, which is
    // the loud failure we want — but catch it here first.
    const skill = readFileSync(
      resolve(import.meta.dirname, '../../.claude/skills/ship-pr/SKILL.md'),
      'utf8'
    );
    const examples = [...skill.matchAll(new RegExp(REVIEW_GATE_LINE.source, 'gm'))];
    expect(
      examples.length,
      'ship-pr must document at least one concrete Review gate line'
    ).toBeGreaterThan(0);
    for (const ex of examples) {
      const r = evaluateReviewGate({
        headSha: captured(ex, 3, 'the head sha in the documented line').padEnd(40, '0'),
        changedFiles: [],
        comments: [comment(ex[0])],
      });
      expect(r.state, ex[0]).toBe('success');
    }
  });
});

describe('owner override associations', () => {
  it('limits override authorization to owners and members', () => {
    expect([...OWNER_OVERRIDE_ASSOCIATIONS]).toEqual(['OWNER', 'MEMBER']);
  });

  it('a retired human-fallback line never parses as evidence at all (MYK9-532)', () => {
    // REVIEW_GATE_LINE no longer has a `human-fallback` alternative, so
    // parseGateComments must drop it silently — evaluateReviewGate is what
    // turns its absence into the targeted refusal message, not this parser.
    expect(
      parseGateComments([
        comment(
          [
            `Review gate: human-fallback reviewed 0a2020c7a..${H9} — 2 adversarial subagent reviews, all findings addressed`,
            'Fallback reason: Codex unavailable — usage limit',
            'Adversarial subagent review: correctness',
            'Adversarial subagent review: security',
            'Required checks: passing',
          ].join('\n')
        ),
      ])
    ).toEqual([]);
  });
});

describe('workflow wiring', () => {
  const workflow = readFileSync(
    resolve(import.meta.dirname, '../../.github/workflows/review-gate.yml'),
    'utf8'
  );

  it('re-evaluates when evidence is edited or deleted, not only created', () => {
    // A clean attestation edited to report unresolved findings, or deleted
    // outright, must not leave a stale green status (Codex review of #2058).
    // A wiring assertion on source text is fair here: deleting the trigger
    // deletes the string.
    const issueComment = workflow.match(/issue_comment:\n\s+types: \[([^\]]+)\]/);
    expect(issueComment, 'issue_comment trigger missing').not.toBeNull();
    const types = captured(issueComment, 1, 'the issue_comment types list')
      .split(',')
      .map(t => t.trim());
    expect(types).toEqual(expect.arrayContaining(['created', 'edited', 'deleted']));
  });

  it('still runs when an edit REMOVES the evidence prefix', () => {
    expect(workflow).toContain("startsWith(github.event.changes.body.from, 'Review gate:')");
  });

  it('runs in the base-branch context so forks and Dependabot get a write-capable token', () => {
    // `pull_request` hands fork/Dependabot runs a read-only token, so the
    // status POST fails exactly where it is needed. `pull_request_target`
    // runs from the base with the base checkout; the script only reads PR
    // metadata, so no PR-controlled code executes (Codex, #2058 round 3).
    expect(workflow).toMatch(/^  pull_request_target:/m);
    expect(workflow).not.toMatch(/^  pull_request:/m);
    // And the checkout must NOT be pointed at the PR head.
    expect(workflow).not.toMatch(/ref:\s*\$\{\{\s*github\.event\.pull_request\.head/);
  });

  it('scopes concurrency to the job, so a skipped run cannot cancel an evaluation', () => {
    // A workflow-level group is claimed even by runs whose only job the `if`
    // skips — an ordinary comment then cancels an in-flight evaluation.
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toMatch(/^    concurrency:\n\s+group: review-gate-/m);
  });

  it('re-evaluates on every push', () => {
    expect(workflow).toMatch(/pull_request_target:\n\s+types: \[[^\]]*synchronize[^\]]*\]/);
  });
});

describe('flattenPages', () => {
  it('unwraps gh api --paginate --slurp output (one array per page)', () => {
    // Plain --paginate concatenates arrays, which JSON.parse rejects past
    // 100 comments (Codex, #2058). Slurped output is an array of pages.
    expect(flattenPages<number>('[[1,2],[3]]')).toEqual([1, 2, 3]);
    expect(flattenPages<number>('[[]]')).toEqual([]);
  });

  it('tolerates a single un-slurped page', () => {
    expect(flattenPages<{ a: number }>('[{"a":1}]')).toEqual([{ a: 1 }]);
  });
});

describe('withdrawal evidence', () => {
  it('a "<N> findings, not addressed" line for the head turns a green gate red', () => {
    // What scripts/qa/post-review-gate.sh --withdraw writes when a re-review of
    // an already-attested head finds defects. Without it the earlier clean line
    // stayed the latest evidence and the gate stayed green (Codex, #2115 r3).
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
      comments: [
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — no findings`,
          '2026-09-07T10:00:00Z'
        ),
        comment(
          `Review gate: codex reviewed 0a2020c7a..${H9} — 2 findings, not addressed`,
          '2026-09-07T11:00:00Z'
        ),
      ],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('2 findings, not addressed');
  });
});

describe('--verdict CLI mode', () => {
  // scripts/qa/post-review-gate.sh asks this script whether a verdict is inside
  // the grammar, so the poster and the checker can never drift. Spawn it for
  // real: an in-process CLEAN_VERDICT.test() would prove the regex, not the CLI.
  const SCRIPT = resolve(import.meta.dirname, 'review-gate.ts');
  function verdictExit(text: string): number {
    try {
      execFileSync(
        process.execPath,
        [
          '--experimental-strip-types',
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          SCRIPT,
          '--verdict',
          text,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return 0;
    } catch (error) {
      return (error as { status: number }).status;
    }
  }

  it.each(['no findings', '2 findings, all addressed', '1 findings, all fixed'])(
    'exits 0 on the accepted verdict %j',
    text => {
      expect(verdictExit(text)).toBe(0);
    }
  );

  it.each([
    // ship-pr documented `finding(s)` as accepted; CLEAN_VERDICT never was.
    '1 finding(s), all addressed',
    'no findings yet',
    'no blocking findings',
    '2 findings, not all addressed',
    '',
  ])('exits 2 on the rejected verdict %j', text => {
    expect(verdictExit(text)).toBe(2);
  });

  it('does not require PR_NUMBER/REPO to answer a verdict question', () => {
    // The verdict check runs before runCli's env validation; a poster that had
    // to set PR_NUMBER just to validate a string would drift from the parser.
    expect(verdictExit('no findings')).toBe(0);
  });
});

describe('clampDescription', () => {
  it('keeps GitHub status descriptions within 140 characters', () => {
    expect(clampDescription('x'.repeat(140))).toHaveLength(140);
    expect(clampDescription('x'.repeat(200))).toHaveLength(140);
    expect(clampDescription('x'.repeat(200))).toMatch(/\.\.\.$/);
  });
});

describe('tier parsing', () => {
  it('maps the legacy codex line to the independent tier', () => {
    const evidence = at(
      parseGateComments([comment(`Review gate: codex reviewed abc1234..${HEAD} — no findings`)]),
      0,
      'the parsed legacy codex evidence'
    );
    expect(evidence.tier).toBe('independent');
    expect(evidence.reviewer).toBe('codex');
  });

  it('parses an explicit tier token', () => {
    const evidence = at(
      parseGateComments([
        comment(
          `Review gate: adversarial reviewed abc1234..${HEAD} — 2 lenses, all findings addressed`
        ),
      ]),
      0,
      'the parsed adversarial evidence'
    );
    expect(evidence.tier).toBe('adversarial');
  });

  it('parses the none tier', () => {
    const evidence = at(
      parseGateComments([
        comment(`Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`),
      ]),
      0,
      'the parsed none-tier evidence'
    );
    expect(evidence.tier).toBe('none');
  });
});

describe('floor enforcement', () => {
  const noneLine = `Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`;

  it('accepts the none tier on a docs-only change', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: ['docs/qa/findings.md'],
    });
    expect(result.state).toBe('success');
  });

  it('refuses the none tier on application code', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('adversarial');
  });

  it('refuses adversarial on a guardrail change', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('forces the independent floor when the file list may be truncated', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: [],
      fileListUnusable: true,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('refuses a human-fallback attempt on an adversarial-floor path too — no floor-check detour (MYK9-532)', () => {
    // Before MYK9-532, `human-fallback` mapped to tier `owner` and had to be
    // measured against the floor like any other tier-`owner` evidence. Now
    // it never parses as evidence at all, so the refusal is the SAME targeted
    // message on every path — never a floor message that would wrongly
    // suggest the token still has a contract to fail.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          [
            `Review gate: human-fallback reviewed abc1234..${HEAD} — 2 adversarial subagent reviews, all findings addressed`,
            'Fallback reason: Claude unavailable — authentication failure',
            'Adversarial subagent review: correctness and data flow',
            'Adversarial subagent review: security and migration safety',
            'Required checks: passing',
          ].join('\n')
        ),
      ],
      changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('human-fallback is retired');
    expect(result.description).not.toContain('below the');
  });

  it('refuses a COLLABORATOR-authored bare "owner" line on a guardrail path (C1)', () => {
    // Codex review of Task 3 round 1: the ORIGINAL exemption keyed off
    // `latest.tier === 'owner'` unconditionally, which the bare `owner`
    // reviewer token also maps to — but `owner` is gated only by
    // `commentTrusted` (OWNER/MEMBER/COLLABORATOR), never by
    // `OWNER_OVERRIDE_ASSOCIATIONS` (OWNER/MEMBER only) or the deferred-issue
    // contract. A COLLABORATOR could post `Review gate: owner reviewed
    // …  — no findings` on a PR rewriting review-gate.ts itself and pass.
    // Corrected: only a CONFIRMED override is exempt; the bare `owner` token
    // gets no exemption and, since it has no entry in VERDICT_BY_TIER, is
    // refused as "not clean" regardless of the floor.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          `Review gate: owner reviewed abc1234..${HEAD} — no findings`,
          undefined,
          undefined,
          'COLLABORATOR'
        ),
      ],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
  });

  describe('verdicts are bound to the tier that claimed them (C2)', () => {
    const independentLine = `Review gate: codex reviewed abc1234..${HEAD} — no findings`;
    const adversarialLine = adversarialBody();

    it('a `none` reviewer cannot wear the `independent` verdict phrase', () => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(`Review gate: none reviewed abc1234..${HEAD} — no findings`)],
        changedFiles: ['docs/qa/findings.md'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/not clean/);
    });

    it('a `codex` (independent) reviewer cannot wear the `none` verdict phrase — reopens #2040 otherwise (C2)', () => {
      // This is the exact probe from Codex review of Task 3 round 1: a verdict
      // that literally asserts NO review happened must never pass at the
      // strongest tier just because the union grammar used to accept it.
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(noneLine.replace('none reviewed', 'codex reviewed'))],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/not clean/);
    });

    it('a `codex` (independent) reviewer cannot wear the `adversarial` verdict phrase', () => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(adversarialLine.replace('adversarial reviewed', 'codex reviewed'))],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/not clean/);
    });

    it('an `adversarial` reviewer cannot wear the `independent` verdict phrase', () => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(independentLine.replace('codex reviewed', 'adversarial reviewed'))],
        changedFiles: ['supabase/migrations/20260101000000_x.sql'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/not clean/);
    });

    it('each tier still accepts its OWN phrase', () => {
      expect(
        evaluateReviewGate({
          headSha: HEAD,
          comments: [comment(independentLine)],
          changedFiles: ['scripts/qa/review-gate.ts'],
        }).state
      ).toBe('success');
      expect(
        evaluateReviewGate({
          headSha: HEAD,
          comments: [comment(adversarialLine)],
          changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
        }).state
      ).toBe('success');
      expect(
        evaluateReviewGate({
          headSha: HEAD,
          comments: [comment(noneLine)],
          changedFiles: ['docs/qa/findings.md'],
        }).state
      ).toBe('success');
    });
  });

  describe('the adversarial verdict requires at least 2 lenses (C3)', () => {
    it.each([
      '0 lenses, all findings addressed',
      '1 lens, all findings addressed',
      '1 lenses, all findings addressed',
      // Zero-padded (Codex review of Task 3 round 2): \d{2,} alone treats a
      // leading zero as "two or more digits", so "00"/"01" cleared the old
      // minimum. [1-9]\d+ closes it — the first digit can never be zero.
      '00 lenses, all findings addressed',
      '01 lenses, all findings addressed',
    ])('rejects %j', verdict => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(adversarialBody(verdict))],
        changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/not clean/);
    });

    // The body must now NAME as many distinct lenses as the verdict claims
    // (M5), so each case carries its own lens list rather than the default two.
    it.each([
      ['2 lens, all findings addressed', 2],
      ['2 lenses, all findings addressed', 2],
      ['10 lenses, all findings addressed', 10],
    ])('accepts %j — (lens|lenses) both work once the count is >= 2 (M1)', (verdict, n) => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [
          comment(
            adversarialBody(
              verdict as string,
              Array.from({ length: n as number }, (_, i) => `lens ${i}`)
            )
          ),
        ],
        changedFiles: ['apps/myk9show/src/pages/Foo.tsx'],
      });
      expect(result.state).toBe('success');
    });
  });

  it('the empty/truncated-list invariant lives INSIDE evaluateReviewGate, not only in the caller (I2)', () => {
    // Codex review of Task 3 round 1, probe F: changedFiles: [] with NO
    // fileListUnusable flag used to fall through to requiredTier([]), which
    // resolves to 'adversarial' — a real floor, but not the STRONGEST one,
    // so a caller that forgot the flag (or computed changedFiles itself,
    // like push-hold.ts) could silently accept adversarial evidence on a
    // guardrail-class PR whose real diff needed `independent`. The empty
    // list alone must now force `independent`, with no flag required.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: [],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('skips floor enforcement AND the widened verdict grammar when the kill switch is off (I1)', () => {
    // Codex review of Task 3 round 1: the kill switch used to guard only the
    // floor block, but CLEAN_VERDICT had been widened unconditionally — so
    // MYK9_REVIEW_TIERS=off was MORE permissive than today, not equal to it.
    // With the switch off, only the original independent-tier grammar is
    // ever valid, so this `none` line (which is red today, before tiers
    // existed at all) must stay red.
    const prev = process.env.MYK9_REVIEW_TIERS;
    process.env.MYK9_REVIEW_TIERS = 'off';
    try {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(noneLine)],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('failure');
    } finally {
      if (prev === undefined) delete process.env.MYK9_REVIEW_TIERS;
      else process.env.MYK9_REVIEW_TIERS = prev;
    }
  });

  it('the kill switch makes a `none`/`adversarial`/`owner` line UNPARSEABLE, not merely unclean (I1 residual)', () => {
    // Codex review of Task 3 round 2: gating only the verdict grammar left
    // these tokens PARSEABLE with the switch off — REVIEW_GATE_LINE on
    // origin/main cannot parse them at all. Pin the exact "no evidence"
    // description (same as an unrecognised token) rather than the generic
    // "not clean" one, proving the evidence is treated as though it never
    // matched the line, not merely rejected on its verdict text.
    const prev = process.env.MYK9_REVIEW_TIERS;
    process.env.MYK9_REVIEW_TIERS = 'off';
    try {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(noneLine)],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('failure');
      expect(result.description).toMatch(/no independent review recorded/);
      expect(result.description).not.toMatch(/not clean/);
    } finally {
      if (prev === undefined) delete process.env.MYK9_REVIEW_TIERS;
      else process.env.MYK9_REVIEW_TIERS = prev;
    }
  });

  it('the kill switch falls back to an earlier LEGACY evidence comment when a newer non-legacy one is ignored', () => {
    // With the switch off, a `none` line posted after a clean `codex` line
    // must not blank out the earlier legacy evidence — it should be as if
    // the `none` comment were never posted at all.
    const prev = process.env.MYK9_REVIEW_TIERS;
    process.env.MYK9_REVIEW_TIERS = 'off';
    try {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [
          comment(
            `Review gate: codex reviewed abc1234..${HEAD} — no findings`,
            '2026-09-05T16:00:00Z'
          ),
          comment(noneLine, '2026-09-05T17:00:00Z'),
        ],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('success');
      expect(result.evidence?.reviewer).toBe('codex');
    } finally {
      if (prev === undefined) delete process.env.MYK9_REVIEW_TIERS;
      else process.env.MYK9_REVIEW_TIERS = prev;
    }
  });

  it('the kill switch leaves ordinary independent-tier evidence unaffected', () => {
    const prev = process.env.MYK9_REVIEW_TIERS;
    process.env.MYK9_REVIEW_TIERS = 'off';
    try {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(`Review gate: codex reviewed abc1234..${HEAD} — no findings`)],
        changedFiles: ['scripts/qa/review-gate.ts'],
      });
      expect(result.state).toBe('success');
    } finally {
      if (prev === undefined) delete process.env.MYK9_REVIEW_TIERS;
      else process.env.MYK9_REVIEW_TIERS = prev;
    }
  });
});

describe('the adversarial tier must NAME its lenses (F3)', () => {
  const MIGRATION = ['supabase/migrations/20260914174500_x.sql'];
  const APP = ['apps/myk9show/src/pages/Foo.tsx'];

  it('accepts a migration when migration-auditor is one of the two lenses', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(adversarialBody('2 lenses, all findings addressed', [MIGRATION_LENS, 'data flow'])),
      ],
      changedFiles: MIGRATION,
    });
    expect(result.state).toBe('success');
  });

  it('refuses a migration whose lenses do not include migration-auditor', () => {
    // The exact reproduction from the final whole-branch review: a GREEN gate
    // on a migration with `adversarial` and no lens named.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: MIGRATION,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain(MIGRATION_LENS);
  });

  it('refuses a migration whose body names NO lens at all', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody('2 lenses, all findings addressed', []))],
      changedFiles: MIGRATION,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('Adversarial subagent review');
  });

  it('refuses fewer than 2 lens lines even off a migration path', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody('2 lenses, all findings addressed', ['only one lens']))],
      changedFiles: APP,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('found 1');
  });

  it('sees the migration in a MIXED diff whose reason string names another file', () => {
    // requiredTier's reason would name the .tsx here (see review-tier.test.ts);
    // the lens rule must key off the file list, not that string.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: [...APP, ...MIGRATION],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain(MIGRATION_LENS);
  });

  it('does not require the migration lens on a non-migration diff', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialBody())],
      changedFiles: APP,
    });
    expect(result.state).toBe('success');
  });
});

describe('the 3000-file truncation cap (F5)', () => {
  // review-gate.ts's resolveFloor pins the floor to `independent` when the
  // changed-file list is empty OR at/over gh's 3000-entry cap, because a
  // truncated list silently LOWERING the floor is the one way this feature
  // would be worse than no floor at all. The cap had no test: replacing
  // `>= 3000` with `false` left the whole suite green.
  const noneLine = `Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`;
  const docs = (n: number) => Array.from({ length: n }, (_, i) => `docs/notes/n${i}.md`);

  it('accepts a docs-only `none` review at 2999 files (below the cap)', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: docs(2999),
    });
    expect(result.state).toBe('success');
  });

  it('forces the independent floor at exactly 3000 files, docs or not', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: docs(3000),
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
    expect(result.description).toContain('3000-file cap');
  });
});

describe('tierForReviewer', () => {
  // The if-chain this replaced ended `return 'independent'`, so any token
  // matching REVIEW_GATE_LINE's alternation but missing from the chain
  // silently got the STRONGEST tier and cleared every floor. The exhaustive
  // `TIER_BY_REVIEWER satisfies Record<ReviewerToken, Tier>` table makes
  // that a `tsc` error instead — this test proves every current token still
  // resolves to a real, ordered tier (the compile-time guarantee is proven
  // separately: see task-4-report.md's tsc evidence).
  it('has an explicit mapping for every REVIEWER_TOKENS member', () => {
    for (const token of REVIEWER_TOKENS) {
      expect(TIER_ORDER).toContain(tierForReviewer(token));
    }
  });
});

describe('owner override', () => {
  const body = (extra: string) =>
    [
      `Review gate: owner reviewed abc1234..${HEAD} — override, floor was independent`,
      'Override reason: Codex unavailable — usage limit until Sep 19',
      extra,
    ]
      .filter(Boolean)
      .join('\n');

  it('accepts an override that names a deferred re-review issue', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body('Deferred re-review: MYK9-523'))],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('success');
  });

  it('refuses an override with no deferred re-review', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body(''))],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('Deferred re-review');
  });

  // Round 1 review, C-A: the pre-existing tests above are all POSITIVE — a
  // full, correct body passes. That cannot distinguish "the reason line is
  // required" from "the reason line is parsed but ignored", nor "the verdict
  // must match owner's own grammar" from "any verdict text is accepted once
  // association and the other two lines are right". The reviewer's mutation
  // matrix found exactly that: removing the `OVERRIDE_REASON.test(...)`
  // check (M2) or the `verdictMatchesTier(..., 'owner')` check (M3) from
  // `overrideAccepted` left the whole suite green. These three negative
  // tests exist specifically to kill M2 and M3 — each must go RED if the
  // guard it names is deleted.
  it('refuses an override with no "Override reason:" line (kills M2)', () => {
    const noReasonBody = [
      `Review gate: owner reviewed abc1234..${HEAD} — override, floor was independent`,
      'Deferred re-review: MYK9-523',
    ].join('\n');
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noReasonBody)],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
  });

  // These two assert `overrideAccepted` DIRECTLY, not through
  // `evaluateReviewGate`: a verdict that fails `OVERRIDE_VERDICT` also fails
  // the I-B claimed-floor extraction (same regex), so `evaluateReviewGate`
  // would report 'failure' for these bodies via I-B's mismatch check even
  // with M3 applied — that would make the test pass for the WRONG reason
  // and fail to kill the mutant it names. Calling `overrideAccepted` in
  // isolation is the only way to pin the verdict-grammar check itself.
  it('refuses an `owner` line wearing the `independent` verdict phrase, even with reason+deferred (kills M3)', () => {
    const wrongVerdictBody = [
      `Review gate: owner reviewed abc1234..${HEAD} — no findings`,
      'Override reason: Codex unavailable — usage limit until Sep 19',
      'Deferred re-review: MYK9-523',
    ].join('\n');
    const [evidence] = parseGateComments([comment(wrongVerdictBody)]);
    expect(overrideAccepted(evidence!)).toBe(false);
  });

  it('refuses an `owner` line wearing the `none` verdict phrase, even with reason+deferred (kills M3)', () => {
    const wrongVerdictBody = [
      `Review gate: owner reviewed abc1234..${HEAD} — low-risk paths, CI green`,
      'Override reason: Codex unavailable — usage limit until Sep 19',
      'Deferred re-review: MYK9-523',
    ].join('\n');
    const [evidence] = parseGateComments([comment(wrongVerdictBody)]);
    expect(overrideAccepted(evidence!)).toBe(false);
  });

  // Round 1 review, I-B: OVERRIDE_VERDICT captures WHICH floor the poster
  // claims they skipped, but nothing checked that claim against the REAL
  // floor `requiredTier` would compute for these `changedFiles`. Not an
  // enforcement hole (the override bypasses the floor either way) — but the
  // recorded debt is the whole contract, so a claim that understates the
  // real floor must be refused.
  it('refuses an override claiming "floor was independent" on a migration (real floor: adversarial)', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body('Deferred re-review: MYK9-523'))],
      changedFiles: ['supabase/migrations/20260101000000_x.sql'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('adversarial');
  });

  it('refuses an override claiming "floor was adversarial" on a guardrail path (real floor: independent)', () => {
    const adversarialClaimBody = [
      `Review gate: owner reviewed abc1234..${HEAD} — override, floor was adversarial`,
      'Override reason: Codex unavailable — usage limit until Sep 19',
      'Deferred re-review: MYK9-523',
    ].join('\n');
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(adversarialClaimBody)],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('refuses an override from an untrusted association', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          body('Deferred re-review: MYK9-523'),
          '2026-09-14T18:00:00Z',
          undefined,
          'CONTRIBUTOR'
        ),
      ],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
  });

  it('accepts a non-Claude harness in the override reason', () => {
    const [evidence] = parseGateComments([comment(body('Deferred re-review: MYK9-523'))]);
    expect(overrideAccepted(evidence!)).toBe(true);
  });

  it('refuses a COLLABORATOR-authored override even with a perfect body (C1 regression)', () => {
    // Guards against re-widening the floor exemption to a bare
    // `latest.tier === 'owner'` test: a COLLABORATOR can post the full
    // override contract — verdict, reason, deferred issue, everything —
    // on a guardrail-path PR, and it must still be refused because
    // `overrideAccepted` checks `OWNER_OVERRIDE_ASSOCIATIONS` (OWNER/MEMBER
    // only) itself, independent of `commentTrusted`'s broader
    // OWNER/MEMBER/COLLABORATOR bar.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          body('Deferred re-review: MYK9-523'),
          '2026-09-14T18:00:00Z',
          undefined,
          'COLLABORATOR'
        ),
      ],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
    const [evidence] = parseGateComments([
      comment(body('Deferred re-review: MYK9-523'), undefined, undefined, 'COLLABORATOR'),
    ]);
    expect(overrideAccepted(evidence!)).toBe(false);
  });

  it('refuses a lowercase issue id in Deferred re-review (M-a: shape check, not decorative)', () => {
    // Round 1 review, M-a: DEFERRED_REVIEW previously carried the `i` flag,
    // making `[A-Z][A-Z0-9]*` decorative — `myk9-523` parsed despite the
    // comment above the regex claiming uppercase. Dropped `i`, kept `m`.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(body('Deferred re-review: myk9-523'))],
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('failure');
  });

  it('refuses the same lens named twice as two lenses', () => {
    // The tier's substance is two INDEPENDENT bug-finding lenses. Repeating
    // one name is one lens, so it must not clear the minimum.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          adversarialBody('2 lenses, all findings addressed', [
            'correctness and data flow',
            'correctness and data flow',
          ])
        ),
      ],
      changedFiles: ['apps/myk9show/src/components/ui/dialog/dialog.tsx'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('2 distinct lenses');
  });

  it('counts a repeated migration-auditor as one lens on a migration', () => {
    // The dangerous shape: the migration rule is satisfied by the repeat,
    // so ONLY the distinct-count rule can refuse this.
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          adversarialBody('2 lenses, all findings addressed', [
            'migration-auditor',
            'migration-auditor',
          ])
        ),
      ],
      changedFiles: ['supabase/migrations/20260914174500_x.sql'],
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('2 distinct lenses');
  });

  it('accepts two genuinely different lenses', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(
          adversarialBody('2 lenses, all findings addressed', [
            'correctness and data flow',
            'security and failure modes',
          ])
        ),
      ],
      changedFiles: ['apps/myk9show/src/components/ui/dialog/dialog.tsx'],
    });
    expect(result.state).toBe('success');
  });
});

/**
 * MYK9-532 retired `human-fallback` outright. PR #2241 — the only PR the
 * token's floor-exemption removal (#2243, M4) had to keep green — merged on
 * 2026-09-15; nothing open depends on the token any more (confirmed via
 * `gh pr list --state open` and a comment scan for its own evidence line).
 * This block replaces the old "PR #2241 stays green" measurement with the
 * opposite regression: that EXACT historical body must now be refused.
 */
describe('human-fallback is refused even in its historically-green shape (MYK9-532)', () => {
  // The VERBATIM body of the evidence comment PR #2241 carried (head
  // a0dd3e1ae, base 057d24d75) before it merged, fetched from GitHub on
  // 2026-09-14, wrapped only for line length.
  const PR2241_HEAD = 'a0dd3e1ae0b6f7e4b9aca8be6355758735634630';
  const PR2241_BODY = [
    'Review gate: human-fallback reviewed 057d24d75..a0dd3e1ae — 2 adversarial subagent reviews, all findings addressed',
    'Fallback reason: Codex unavailable — usage limit reached (`pnpm qa:codex-review` exited 2, GATE DID NOT RUN; limit resets 2026-09-19)',
    'Adversarial subagent review: correctness and internal consistency (Opus, 2 rounds + final verification)',
    'Adversarial subagent review: operational safety of unattended runs against shared staging (Opus, 2 rounds + final verification)',
    'Required checks: passing',
  ].join('\n');
  const PR2241_FILES = ['docs/operations/scheduled-task-walks.md'];

  it("refuses PR #2241's real historical body, even at its `none` floor", () => {
    expect(requiredTier(PR2241_FILES).tier).toBe('none');
    const r = evaluateReviewGate({
      headSha: PR2241_HEAD,
      changedFiles: PR2241_FILES,
      comments: [comment(PR2241_BODY)],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('human-fallback is retired');
    expect(r.evidence).toBeUndefined();
  });

  it('refuses the same body on a guardrail path it used to fail differently', () => {
    const r = evaluateReviewGate({
      headSha: PR2241_HEAD,
      changedFiles: ['scripts/qa/review-gate.ts'],
      comments: [comment(PR2241_BODY)],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('human-fallback is retired');
  });
});

describe("the adversarial verdict's N is bound to the lenses actually named (M5)", () => {
  const body = (verdict: string, lenses: readonly string[]) =>
    [
      `Review gate: adversarial reviewed abc1234..${HEAD} — ${verdict}`,
      ...lenses.map(lens => `Adversarial subagent review: ${lens}`),
    ].join('\n');
  const APP = ['apps/myk9show/src/pages/Foo.tsx'];

  it('refuses an OVERSTATED count — 9 claimed, 2 named', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: APP,
      comments: [comment(body('9 lenses, all findings addressed', ['correctness', 'security']))],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('claims 9 lenses but names 2 distinct');
  });

  it('refuses an UNDERSTATED count — 2 claimed, 3 named', () => {
    // Both directions: the record must match what happened, not merely clear a
    // minimum. An understated count is still a record of a different review.
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: APP,
      comments: [comment(body('2 lenses, all findings addressed', ['a', 'b', 'c']))],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('claims 2 lenses but names 3 distinct');
  });

  it('counts DISTINCT names, so a repeat cannot pad the claim', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: APP,
      comments: [comment(body('3 lenses, all findings addressed', ['a', 'b', 'a']))],
    });
    expect(r.state).toBe('failure');
    expect(r.description).toContain('names 2 distinct');
  });

  it('accepts a count that matches', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: APP,
      comments: [comment(body('3 lenses, all findings addressed', ['a', 'b', 'c']))],
    });
    expect(r.state).toBe('success');
  });
});

describe('VERDICT_BY_TIER exhaustiveness is a program, not an annotation', () => {
  // `Readonly<Record<Tier, RegExp>>` and the `satisfies` on TIER_BY_REVIEWER
  // are enforced by a `tsc` that never runs: scripts/qa/ belongs to no
  // typecheck project, so `pnpm typecheck` exits 0 on a deliberate type error
  // in this file (re-verified by the fallback review of #2243, D3/S-b).
  // TIER_BY_REVIEWER already had a runtime test; this is its counterpart.
  // A missing row makes verdictMatchesTier throw INSIDE the Action, so no
  // status is posted at all — the checker crashing instead of returning a red
  // verdict is the exact failure mode review-gate.ts's header forbids.
  it.each(TIER_ORDER)('has a verdict grammar for tier %s', tier => {
    expect(VERDICT_BY_TIER[tier]).toBeInstanceOf(RegExp);
  });

  it('has no rows beyond the declared tiers', () => {
    expect(Object.keys(VERDICT_BY_TIER).sort()).toEqual([...TIER_ORDER].sort());
  });
});

describe('an override can record a convergence stop honestly (S-e)', () => {
  // Security lens S5: OVERRIDE_REASON required the literal word "unavailable",
  // so the one state where the reviewer IS reachable and the round must stop
  // anyway (CLAUDE.md's convergence rule) had no green wording — recording it
  // meant writing something false, the exact shape this feature exists to
  // remove. The deferred-issue line is still required: a convergence stop
  // defers scrutiny and owes a restructure, it does not waive anything.
  const evidence = (reason: string, deferred = 'Deferred re-review: MYK9-523') =>
    parseGateComments([
      comment(
        [
          `Review gate: owner reviewed abc1234..${HEAD} — override, floor was independent`,
          `Override reason: ${reason}`,
          deferred,
        ].join('\n')
      ),
    ])[0]!;

  it('accepts a convergence stop with a concrete detail', () => {
    expect(
      overrideAccepted(
        evidence(
          'convergence stop — 2nd finding on scripts/qa/review-gate.ts; restructure proposed'
        )
      )
    ).toBe(true);
  });

  it('still accepts the unavailable-harness form', () => {
    expect(overrideAccepted(evidence('Codex unavailable — usage limit until Sep 19'))).toBe(true);
  });

  it('still requires a detail after the dash', () => {
    expect(overrideAccepted(evidence('convergence stop'))).toBe(false);
  });

  it('still requires the deferred issue', () => {
    expect(overrideAccepted(evidence('convergence stop — rounds 1-7 on one path', ''))).toBe(false);
  });

  it('refuses a reason that is neither form', () => {
    expect(overrideAccepted(evidence('I was busy — will review later'))).toBe(false);
  });
});

describe('fileListIsUnusable', () => {
  // The floor is derived from WHICH paths a PR touches, so a short list is
  // more dangerous than an empty one: it computes a LOWER floor than the diff
  // deserves instead of failing closed.
  it('treats an empty fetch as unusable', () => {
    expect(fileListIsUnusable(0, 0)).toBe(true);
    expect(fileListIsUnusable(0)).toBe(true);
  });

  it('treats a fetch short of GitHub’s own count as unusable', () => {
    // The exact shape of PR #2121: GitHub declares 1734, one GraphQL page
    // carries 100.
    expect(fileListIsUnusable(100, 1734)).toBe(true);
  });

  it('accepts a complete fetch, however large', () => {
    expect(fileListIsUnusable(1734, 1734)).toBe(false);
    expect(fileListIsUnusable(2999, 2999)).toBe(false);
  });

  it('treats the REST endpoint’s own 3000-entry ceiling as unusable', () => {
    expect(fileListIsUnusable(REST_FILE_PAGE_CAP, 4200)).toBe(true);
    expect(fileListIsUnusable(REST_FILE_PAGE_CAP, REST_FILE_PAGE_CAP)).toBe(true);
  });

  it('refuses to vouch for a list GitHub declares nothing about', () => {
    // `changedFiles` is a real `gh pr view --json` field, so its absence means
    // an assumption broke. Falling back to the count-only rule is exactly what
    // let the original truncation through, so this fails closed instead.
    expect(fileListIsUnusable(42)).toBe(true);
    expect(fileListIsUnusable(42, undefined)).toBe(true);
  });

  it('catches a shortfall of ONE, not just a gross one', () => {
    // A mutant reading `fetchedCount * 2 < declaredCount` passes every other
    // assertion here: it still calls 100-of-1734 unusable. These pin the
    // comparison itself rather than its order of magnitude.
    expect(fileListIsUnusable(419, 420)).toBe(true);
    expect(fileListIsUnusable(1733, 1734)).toBe(true);
    expect(fileListIsUnusable(420, 420)).toBe(false);
  });
});

describe('runCli’s changed-file fetch', () => {
  // `gh pr view --json files` asks GraphQL for ONE page and never paginates.
  // Under the old `>= 3000` check a 1734-file PR arrived as 100 files, read as
  // complete, and had its floor computed from that partial diff.
  const noneLine = `Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`;
  const env = { PR_NUMBER: '2121', REPO: FAKE_REPO } as NodeJS.ProcessEnv;

  function fakeGh(opts: { declared?: number; fetched: string[] }) {
    const calls: string[][] = [];
    const run = (args: string[]): string => {
      calls.push(args);
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          headRefOid: HEAD,
          isDraft: false,
          ...(opts.declared === undefined ? {} : { changedFiles: opts.declared }),
        });
      }
      if (args.some(a => a.includes('/pulls/'))) {
        return opts.fetched.join('\n') + (opts.fetched.length ? '\n' : '');
      }
      if (args.some(a => a.includes('/issues/'))) {
        return JSON.stringify([
          [
            {
              body: noneLine,
              created_at: '2026-09-05T16:00:00Z',
              updated_at: '2026-09-05T16:00:00Z',
              author_association: 'OWNER',
              user: { login: 'rbeezley' },
            },
          ],
        ]);
      }
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    };
    return { run, calls };
  }

  const docs = (n: number) => Array.from({ length: n }, (_, i) => `docs/notes/n${i}.md`);

  it('never asks `gh pr view` for the files list', () => {
    const { run, calls } = fakeGh({ declared: 3, fetched: docs(3) });
    runCli(env, ['--dry-run'], run);
    const view = calls.find(c => c[0] === 'pr' && c[1] === 'view');
    if (!view) throw new Error('runCli never called `gh pr view`');
    const fields = (view[view.indexOf('--json') + 1] ?? '').split(',');
    expect(fields).not.toContain('files');
    expect(fields).toContain('changedFiles');
  });

  it('fetches every page of the REST files endpoint', () => {
    const { run, calls } = fakeGh({ declared: 3, fetched: docs(3) });
    runCli(env, ['--dry-run'], run);
    expect(calls).toContainEqual([
      'api',
      '--paginate',
      '--jq',
      '.[].filename',
      `repos/${FAKE_REPO}/pulls/2121/files?per_page=100`,
    ]);
  });

  it('asks for filenames only, never the patch bodies', () => {
    // Measured 2026-09-15: this endpoint returns 8.2 MB with `patch` bodies
    // for PR #2121 and 99 KB filtered to names. execFileSync throws ENOBUFS
    // past 1 MiB, and the script would die before posting any status.
    const { run, calls } = fakeGh({ declared: 3, fetched: docs(3) });
    runCli(env, ['--dry-run'], run);
    const files = calls.find(c => c.some(a => a.includes('/pulls/')));
    if (!files) throw new Error('runCli never fetched the file list');
    expect(files).toContain('--jq');
    expect(files).not.toContain('--slurp');
    expect(GH_MAX_BUFFER_BYTES).toBeGreaterThan(8_214_722);
  });

  it('refuses a `none` review when the fetch came back short of the declared count', () => {
    // 100 docs paths fetched, 1734 declared: the 1634 unseen files could be
    // anything, including scripts/qa/**. Before the fix this returned 0.
    const { run } = fakeGh({ declared: 1734, fetched: docs(100) });
    expect(runCli(env, ['--dry-run'], run)).toBe(1);
  });

  it('accepts a `none` review on a complete docs-only fetch of over 100 files', () => {
    // The paginated fetch returns all 420, so a large docs-only PR is not
    // punished with the independent floor for its size alone.
    const { run } = fakeGh({ declared: 420, fetched: docs(420) });
    expect(runCli(env, ['--dry-run'], run)).toBe(0);
  });

  it('forces the independent floor when the complete fetch reveals a guardrail path', () => {
    const { run } = fakeGh({
      declared: 420,
      fetched: [...docs(419), 'scripts/qa/review-gate.ts'],
    });
    expect(runCli(env, ['--dry-run'], run)).toBe(1);
  });
});

/**
 * MYK9-560 item 4. The short-list invariant has two copies — the
 * `fileListUnusable` flag runCli computes, and the one `floorFor` re-derives
 * from `declaredFileCount` — and each was individually unpinned: deleting
 * `declaredFileCount: view.changedFiles` from the `runCli` call, or hardcoding
 * `const fileListUnusable = false`, each left all 147 tests green because the
 * other copy covered it. Neither is observable from runCli's OUTPUT, since
 * runCli derives both from the same two numbers. These tests assert the input
 * runCli hands the evaluator, which is where the two are distinguishable.
 */
describe('runCli threads BOTH halves of the short-list invariant to the evaluator', () => {
  const env = { PR_NUMBER: '2121', REPO: FAKE_REPO } as NodeJS.ProcessEnv;
  const docs = (n: number) => Array.from({ length: n }, (_, i) => `docs/notes/n${i}.md`);

  function capture(opts: { declared?: number; fetched: string[] }): EvaluateReviewGateInput {
    const run = (args: string[]): string => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({
          headRefOid: HEAD,
          isDraft: false,
          ...(opts.declared === undefined ? {} : { changedFiles: opts.declared }),
        });
      }
      if (args.some(a => a.includes('/pulls/'))) {
        return opts.fetched.join('\n') + (opts.fetched.length ? '\n' : '');
      }
      if (args.some(a => a.includes('/issues/'))) return JSON.stringify([[]]);
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    };
    let seen: EvaluateReviewGateInput | undefined;
    runCli(env, ['--dry-run'], run, input => {
      seen = input;
      return { state: 'failure', description: 'captured' };
    });
    if (!seen) throw new Error('runCli never called the evaluator');
    return seen;
  }

  it('passes GitHub’s declared count through, so the in-module copy can see a short fetch', () => {
    // Deleting `declaredFileCount: view.changedFiles` from the runCli call
    // must redden THIS test. Without it `floorFor` compares the fetched list
    // against itself and its mismatch arm is inert.
    expect(capture({ declared: 1734, fetched: docs(100) }).declaredFileCount).toBe(1734);
    expect(capture({ declared: 420, fetched: docs(420) }).declaredFileCount).toBe(420);
  });

  it('computes the unusable flag itself rather than leaving it to the evaluator', () => {
    // Hardcoding `const fileListUnusable = false` must redden THIS test.
    expect(capture({ declared: 1734, fetched: docs(100) }).fileListUnusable).toBe(true);
    expect(capture({ declared: 420, fetched: docs(420) }).fileListUnusable).toBe(false);
    // An absent `changedFiles` is a broken assumption, not a normal case.
    expect(capture({ fetched: docs(3) }).fileListUnusable).toBe(true);
  });
});

describe('parseFileNameList', () => {
  it('reads one path per line and ignores blank lines', () => {
    expect(parseFileNameList('a.ts\nb.ts\n')).toEqual(['a.ts', 'b.ts']);
    expect(parseFileNameList('a.ts\n\nb.ts')).toEqual(['a.ts', 'b.ts']);
  });

  it('reads an empty response as no files, not as one blank path', () => {
    expect(parseFileNameList('')).toEqual([]);
    expect(parseFileNameList('\n')).toEqual([]);
  });
});

describe('evaluateReviewGate sees the declared count too', () => {
  // Before this was threaded through, the in-module copy of the invariant
  // could only detect an EMPTY or at-cap list, so a caller other than runCli
  // could clear a guardrail PR on a short list — the exact case the fix is
  // about. The floor check must not depend on runCli remembering to set a flag.
  const noneLine = `Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`;
  const docs = (n: number) => Array.from({ length: n }, (_, i) => `docs/notes/n${i}.md`);

  it('forces the independent floor on a short list with no flag set', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: docs(100),
      declaredFileCount: 1734,
    });
    expect(result.state).toBe('failure');
    expect(result.description).toContain('independent');
  });

  it('accepts the same list when GitHub declares exactly that many', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: docs(100),
      declaredFileCount: 100,
    });
    expect(result.state).toBe('success');
  });

  it('does not punish a caller that has no declared count', () => {
    const result = evaluateReviewGate({
      headSha: HEAD,
      comments: [comment(noneLine)],
      changedFiles: docs(100),
    });
    expect(result.state).toBe('success');
  });
});

describe('runGh hands execFileSync a buffer large enough for a real fetch', () => {
  it('passes GH_MAX_BUFFER_BYTES, not the 1 MiB default', () => {
    // Asserting the constant alone proves it exists, not that anything uses
    // it. Deleting `maxBuffer:` from the call must redden THIS test — the
    // 1 MiB default is what threw ENOBUFS on an 8.2 MB response.
    let seen: unknown;
    const fakeExec = ((_file: string, _args: string[], opts: unknown) => {
      seen = opts;
      return '';
    }) as unknown as typeof import('node:child_process').execFileSync;
    runGh(['pr', 'view'], fakeExec);
    const opts = seen as { maxBuffer?: number; encoding?: string };
    expect(opts.encoding).toBe('utf8');
    expect(opts.maxBuffer).toBe(GH_MAX_BUFFER_BYTES);
    expect(opts.maxBuffer ?? 0).toBeGreaterThan(8_214_722);
  });
});

describe('a crash cannot read as a standing pass', () => {
  // The required `Review gate` context is a COMMIT status pinned to the SHA.
  // When the evaluation threw, nothing was posted — so on an issue_comment
  // edit that WITHDREW an attestation, the older green status survived.
  const env = { PR_NUMBER: '2121', REPO: FAKE_REPO } as NodeJS.ProcessEnv;

  function runnerThatFailsOnFiles() {
    const posted: string[][] = [];
    const run = (args: string[]): string => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ headRefOid: HEAD, isDraft: false, changedFiles: 4 });
      }
      if (args.some(a => a.includes('/pulls/'))) throw new Error('HTTP 403: rate limited');
      if (args.includes('--method')) {
        posted.push(args);
        return '';
      }
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    };
    return { run, posted };
  }

  it('posts a failure status when the file fetch throws', () => {
    const { run, posted } = runnerThatFailsOnFiles();
    expect(runCli(env, [], run)).toBe(0);
    expect(posted).toHaveLength(1);
    const fields = posted[0] ?? [];
    expect(fields.join(' ')).toContain('state=failure');
    expect(fields.join(' ')).toContain(`statuses/${HEAD}`);
    expect(fields.join(' ')).toContain('rate limited');
  });

  it('attempts no POST and exits non-zero when `pr view` came back without a headRefOid', () => {
    // A well-formed payload MISSING `headRefOid` throws inside
    // evaluateReviewGate (`input.headSha.toLowerCase()`), enters the catch —
    // and the catch used to build its own description from
    // `view.headRefOid.slice(0, 9)`, throwing a second TypeError and posting
    // NOTHING (MYK9-560 item 2).
    //
    // The catch no longer throws, but there is still no SHA to pin a status
    // to: POSTing anyway hits `statuses/undefined` and GitHub answers 422, so
    // the improved description never lands (round-1 review, P3). Instead the
    // script logs the verdict and exits NON-ZERO, which fails the step and
    // hands the job to the workflow's `if: failure()` fallback — the one
    // place that can resolve a SHA from the event payload.
    const posted: string[][] = [];
    const run = (args: string[]): string => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ isDraft: false, changedFiles: 1 });
      }
      if (args.some(a => a.includes('/pulls/'))) return 'docs/notes/n0.md\n';
      if (args.some(a => a.includes('/issues/'))) return JSON.stringify([[]]);
      if (args.includes('--method')) {
        posted.push(args);
        return '';
      }
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    };
    expect(runCli(env, [], run)).not.toBe(0);
    expect(posted).toHaveLength(0);
  });

  it('attempts no POST and exits non-zero on a short-SHA `headRefOid`', () => {
    // Not just a MISSING headRefOid: a present-but-unusable one must be
    // refused too, or the POST targets `statuses/abc1234`, which is not a
    // commit. This is the fixture that makes isFullSha's 40-char requirement
    // load-bearing from the CLI's side (round-2 review, P2).
    const posted: string[][] = [];
    const run = (args: string[]): string => {
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ headRefOid: 'abc1234', isDraft: false, changedFiles: 1 });
      }
      if (args.some(a => a.includes('/pulls/'))) return 'docs/notes/n0.md\n';
      if (args.some(a => a.includes('/issues/'))) return JSON.stringify([[]]);
      if (args.includes('--method')) {
        posted.push(args);
        return '';
      }
      throw new Error(`unexpected gh call: ${args.join(' ')}`);
    };
    expect(runCli(env, [], run)).toBe(1);
    expect(posted).toHaveLength(0);
  });

  it('posts through the injected runner, never a real gh', () => {
    // Without this the unit suite is one forgotten --dry-run away from
    // POSTing a commit status to a real SHA in the real repository.
    const { run, posted } = runnerThatFailsOnFiles();
    runCli(env, [], run);
    expect(posted.length).toBeGreaterThan(0);
  });
});

/**
 * MYK9-555 / MYK9-560 item 3. The `if: failure()` step is the last hop: it
 * covers a throw from the first `gh pr view` (before the script has a SHA to
 * post against) and a throw from the POST at the end of the script. Its logic
 * lives in the workflow's shell, so asserting the YAML text would only prove
 * someone typed it (LESSONS `comment-satisfies-grep`). These tests EXTRACT the
 * step's `run:` block and execute it against a stub `gh` on PATH.
 */
describe('the workflow’s crash-fallback step', () => {
  const workflowPath = resolve(import.meta.dirname, '../../.github/workflows/review-gate.yml');
  const STEP_NAME = 'Post a failure status when the gate itself crashed';

  /** Pull the step's `run: |` body out of the YAML and dedent it. */
  function extractFallbackScript(): string {
    const yaml = readFileSync(workflowPath, 'utf8');
    const stepAt = yaml.indexOf(`- name: ${STEP_NAME}`);
    if (stepAt < 0) throw new Error(`workflow has no step named "${STEP_NAME}"`);
    const runAt = yaml.indexOf('run: |\n', stepAt);
    if (runAt < 0) throw new Error('the crash-fallback step has no `run: |` block');
    const lines = yaml.slice(runAt + 'run: |\n'.length).split('\n');
    const body: string[] = [];
    for (const line of lines) {
      if (line.trim() !== '' && !line.startsWith('          ')) break;
      body.push(line.slice(10));
    }
    const script = body.join('\n').trimEnd();
    if (script === '') throw new Error('the crash-fallback step’s run block is empty');
    return script;
  }

  /**
   * Run that script with a stub `gh` first on PATH. The stub appends every
   * invocation to a log and honours `STUB_GH_VIEW_EXIT` so the
   * `gh pr view` fallback can be made to fail.
   */
  function runFallback(env: Record<string, string>): { stdout: string; ghCalls: string[][] } {
    const dir = mkdtempSync(join(tmpdir(), 'review-gate-fallback-'));
    const log = join(dir, 'gh-calls.log');
    const stub = join(dir, 'gh');
    writeFileSync(
      stub,
      [
        '#!/bin/sh',
        // One line per ARGUMENT, with a record separator per invocation.
        // Joining args with spaces made every assertion a substring match:
        // `-f context='Review gateX'` satisfied `toContain('context=Review
        // gate')` and the fallback would post under a context no required
        // check watches (round-2 review, P2).
        `{ printf '%s\\n' '--CALL--'; printf '%s\\n' "$@"; } >> ${JSON.stringify(log)}`,
        'if [ "$1" = "pr" ]; then',
        '  if [ -n "${STUB_GH_VIEW_STDERR:-}" ]; then',
        '    echo "${STUB_GH_VIEW_STDERR}" >&2',
        '  fi',
        '  if [ "${STUB_GH_VIEW_EXIT:-0}" != "0" ]; then',
        '    echo "gh: could not resolve the pull request" >&2',
        '    exit "${STUB_GH_VIEW_EXIT}"',
        '  fi',
        '  printf \'%s\\n\' "${STUB_GH_VIEW_SHA:-}"',
        'fi',
        'exit 0',
        '',
      ].join('\n')
    );
    chmodSync(stub, 0o755);
    writeFileSync(log, '');
    const scriptPath = join(dir, 'fallback.sh');
    writeFileSync(scriptPath, extractFallbackScript());
    // EXACTLY the options `shell: bash` gives this step on GitHub. Without a
    // `shell:` declaration GitHub would run `bash -e {0}` with no `pipefail`,
    // and a test running richer options than CI can pass on behaviour CI does
    // not have (round-2 review, P3). The assertion below pins the pairing.
    const stdout = execFileSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', scriptPath], {
      encoding: 'utf8',
      env: { PATH: `${dir}:${process.env.PATH ?? ''}`, ...env },
    });
    const ghCalls: string[][] = [];
    for (const line of readFileSync(log, 'utf8').split('\n')) {
      if (line === '--CALL--') ghCalls.push([]);
      else if (line !== '') ghCalls.at(-1)?.push(line);
    }
    return { stdout, ghCalls };
  }

  const isPost = (call: readonly string[]) => call.includes('--method') && call.includes('POST');
  const isPrView = (call: readonly string[]) => call[0] === 'pr' && call[1] === 'view';

  const base = { REPO: FAKE_REPO, PR_NUMBER: '2121', RUN_URL: 'https://example.invalid/run/1' };

  it('posts a failure status to the head SHA the pull_request_target payload carries', () => {
    const { ghCalls } = runFallback({ ...base, HEAD_SHA: HEAD });
    const post = ghCalls.find(isPost);
    if (!post) throw new Error(`no POST in: ${JSON.stringify(ghCalls)}`);
    // Exact ARGUMENT matches, not substrings of a joined string: the context
    // must be the token the required check watches, so `context=Review gateX`
    // has to fail.
    expect(post).toContain(`repos/${FAKE_REPO}/statuses/${HEAD}`);
    expect(post).toContain('state=failure');
    expect(post).toContain(`context=${REVIEW_GATE_CONTEXT}`);
    expect(post.filter(a => a.startsWith('context='))).toEqual([`context=${REVIEW_GATE_CONTEXT}`]);
    expect(ghCalls.some(isPrView)).toBe(false);
  });

  it('resolves the SHA with one `gh pr view` when the payload has none (issue_comment)', () => {
    const { ghCalls } = runFallback({ ...base, HEAD_SHA: '', STUB_GH_VIEW_SHA: OLD_HEAD });
    const views = ghCalls.filter(isPrView);
    expect(views).toHaveLength(1);
    // ADJACENCY, not mere presence: `--json a,b --jq headRefOid` contains both
    // tokens and asks for the wrong thing (round-3 review, P3).
    const viewArgs = views[0] ?? [];
    expect(viewArgs[viewArgs.indexOf('--json') + 1]).toBe('headRefOid');
    const post = ghCalls.find(isPost);
    if (!post) throw new Error(`no POST in: ${JSON.stringify(ghCalls)}`);
    expect(post).toContain(`repos/${FAKE_REPO}/statuses/${OLD_HEAD}`);
    expect(post).toContain('state=failure');
  });

  it('posts the SHA even when `gh pr view` also writes a warning to stderr', () => {
    // `2>&1` merged gh's diagnostics into the captured SHA, so ONE ordinary
    // deprecation or scope warning contaminated an otherwise valid answer, the
    // hex guard rejected it, and the step posted nothing — reinstating the
    // stale-green fail-open this step exists to close (round-1 review, P2).
    const { ghCalls } = runFallback({
      ...base,
      HEAD_SHA: '',
      STUB_GH_VIEW_SHA: OLD_HEAD,
      STUB_GH_VIEW_STDERR: 'gh: warning: this command is deprecated',
    });
    const post = ghCalls.find(isPost);
    if (!post) throw new Error(`no POST in: ${JSON.stringify(ghCalls)}`);
    expect(post).toContain(`repos/${FAKE_REPO}/statuses/${OLD_HEAD}`);
    expect(post).toContain('state=failure');
  });

  it('posts nothing, and says so, when `gh pr view` fails too', () => {
    const { stdout, ghCalls } = runFallback({
      ...base,
      HEAD_SHA: '',
      STUB_GH_VIEW_EXIT: '1',
    });
    expect(ghCalls.some(isPost)).toBe(false);
    expect(stdout).toContain('posting no status');
  });

  it('rejects a 40-char string that is the right LENGTH but not hex', () => {
    // Both halves of the guard must be load-bearing. Every other fixture here
    // is hex, so only the length test was firing and deleting the `case` line
    // left the suite green (round-2 review, P3). These are exactly 40 chars.
    const fortyNonHex = [
      'g'.repeat(40), // out of the hex alphabet
      HEAD.slice(0, 39).toUpperCase() + 'A', // uppercase hex is not accepted
      `${HEAD.slice(0, 37)}../`, // 40 chars, still a traversal
    ];
    for (const value of fortyNonHex) {
      expect(value).toHaveLength(40);
      const fromPayload = runFallback({ ...base, HEAD_SHA: value });
      expect(fromPayload.ghCalls.some(isPost)).toBe(false);
      const fromView = runFallback({ ...base, HEAD_SHA: '', STUB_GH_VIEW_SHA: value });
      expect(fromView.ghCalls.some(isPost)).toBe(false);
    }
  });

  it('validates the EVENT payload’s SHA too, not just the one it resolves', () => {
    // The guard sat inside the `if [ -z "$sha" ]` branch, so it only ever saw
    // the `gh pr view` answer; `HEAD_SHA` from the event payload went to the
    // POST unvalidated. A reviewer drove `HEAD_SHA=../../../evil` straight
    // into `POST repos/<repo>/statuses/../../../evil` (round-2 review, P3).
    for (const bogus of ['../../../evil', 'abc', `${HEAD}a`, 'not a sha']) {
      const { ghCalls } = runFallback({ ...base, HEAD_SHA: bogus });
      expect(ghCalls.some(isPost)).toBe(false);
    }
    // Control: a real 40-char SHA from the payload still posts.
    const { ghCalls } = runFallback({ ...base, HEAD_SHA: HEAD });
    expect(ghCalls.some(c => c.includes(`repos/${FAKE_REPO}/statuses/${HEAD}`))).toBe(true);
  });

  it('never posts a status to a target that is not a hex SHA', () => {
    // A status posted to `gh: could not resolve...` would be a wild POST.
    const { ghCalls } = runFallback({
      ...base,
      HEAD_SHA: '',
      STUB_GH_VIEW_SHA: 'not a sha',
    });
    expect(ghCalls.some(isPost)).toBe(false);
  });

  it('never posts to a hex FRAGMENT — the target must be a full 40-char SHA', () => {
    // A charset-only guard passes `abc`, which POSTs to `statuses/abc`
    // (round-1 review, P3). Both a short fragment and an over-long string are
    // rejected; only exactly 40 lowercase hex is a status target.
    for (const partial of ['abc', HEAD.slice(0, 39), `${HEAD}a`]) {
      const { ghCalls } = runFallback({ ...base, HEAD_SHA: '', STUB_GH_VIEW_SHA: partial });
      expect(ghCalls.some(isPost)).toBe(false);
    }
    // The control: exactly 40 still posts, so the guard is not simply inert.
    const { ghCalls } = runFallback({ ...base, HEAD_SHA: '', STUB_GH_VIEW_SHA: HEAD });
    expect(ghCalls.some(c => c.includes(`repos/${FAKE_REPO}/statuses/${HEAD}`))).toBe(true);
  });

  /**
   * Every step of the job, in order, with its declared `timeout-minutes`.
   * A step with no timeout comes back `undefined` rather than being skipped —
   * the whole point of the invariant below is that there are none.
   */
  function parseJobSteps(): { name?: string; timeout?: number }[] {
    const yaml = readFileSync(workflowPath, 'utf8');
    const stepsAt = yaml.indexOf('\n    steps:\n');
    if (stepsAt < 0) throw new Error('the job has no `steps:` block');
    const body = yaml.slice(stepsAt + '\n    steps:\n'.length);
    // Each step starts at `      - `; nothing else in this file sits at that
    // indent, and the job is the last thing in the file.
    const chunks = body.split(/^ {6}- /m).slice(1);
    return chunks.map(chunk => {
      // ONLY a real `name:` key counts. Falling back to the chunk's first line
      // made every step look named — an unnamed `- uses: actions/cache@v4`
      // yielded the name "uses: actions/cache@v4", truthy, so the "every step
      // is named" assertion could never fire (round-3 review, P3).
      const timeout = chunk.match(/^ {8}timeout-minutes: (\d+)$/m)?.[1];
      return {
        name: chunk.startsWith('name: ') ? chunk.slice('name: '.length).split('\n')[0] : undefined,
        timeout: timeout === undefined ? undefined : Number(timeout),
      };
    });
  }

  it('gives EVERY step its own timeout, so a hang fails the step instead of cancelling the job', () => {
    // A job that trips its own `timeout-minutes` is marked CANCELLED, not
    // failed (LESSONS `cancelled-may-be-timeout`), and `if: failure()` does
    // not fire on a cancelled job. So any step WITHOUT its own limit runs to
    // the job backstop and skips this fallback — the fail-open, relocated to
    // whichever step was left uncovered. `checkout` and `setup-node` had none
    // (round-2 review, P2), and the previous version of this test asserted
    // there were exactly two step timeouts, so ADDING the missing ones would
    // have reddened it. This asserts the invariant instead of the count.
    const steps = parseJobSteps();
    expect(steps.length).toBeGreaterThanOrEqual(4);
    steps.forEach((step, i) => {
      // Named, so the by-name assertion below actually covers it: an unnamed
      // step is invisible to that test and could carry any timeout at all.
      expect(step.name, `step ${i} has no \`name:\` key`).toBeTypeOf('string');
      expect(step.timeout, `step "${step.name ?? `#${i}`}" has no timeout-minutes`).toBeTypeOf(
        'number'
      );
    });
    // Every step the job declares is one this file knows about, so a step
    // added without a by-name expectation below cannot slip through.
    expect(steps.map(step => step.name)).toEqual([
      'Check out the base branch',
      'Set up Node',
      'Post Review gate status for the PR head',
      STEP_NAME,
    ]);
  });

  it('gives each step the timeout it is supposed to have, by name', () => {
    // By NAME, not by position: swapping two timeouts leaves every count and
    // every sum identical.
    const byName = new Map(parseJobSteps().map(s => [s.name, s.timeout]));
    expect(byName.get('Check out the base branch')).toBe(2);
    expect(byName.get('Set up Node')).toBe(3);
    expect(byName.get('Post Review gate status for the PR head')).toBe(5);
    expect(byName.get(STEP_NAME)).toBe(3);
  });

  it('keeps the job backstop above the sum of every step timeout', () => {
    // If the backstop could be reached first it would cancel the job and skip
    // this step, which is the bug the per-step timeouts exist to prevent.
    const steps = parseJobSteps();
    const sum = steps.reduce((total, s) => total + (s.timeout ?? 0), 0);
    const yaml = readFileSync(workflowPath, 'utf8');
    const jobTimeout = yaml.match(/^ {4}timeout-minutes: (\d+)$/m);
    if (!jobTimeout) throw new Error('the job has no backstop timeout');
    expect(Number(jobTimeout[1])).toBeGreaterThan(sum);
  });

  it('declares `shell: bash` on both run steps, the options the harness replays', () => {
    // The harness runs the extracted script under
    // `bash --noprofile --norc -eo pipefail`. GitHub uses those options only
    // when the step says `shell: bash`; the default is `bash -e {0}`, no
    // pipefail. Without this, the harness tests a shell CI does not run.
    //
    // Matched as a LINE, not a substring: the comment above each step
    // explains the choice and itself contains the literal `shell: bash`, so a
    // `toContain` stayed green with the real key deleted (LESSONS
    // `comment-satisfies-grep`).
    const yaml = readFileSync(workflowPath, 'utf8');
    for (const step of ['Post Review gate status for the PR head', STEP_NAME]) {
      const at = yaml.indexOf(`- name: ${step}`);
      expect(at, `no step named "${step}"`).toBeGreaterThan(-1);
      const body = yaml.slice(at, yaml.indexOf('\n        run:', at));
      expect(body, `step "${step}" does not declare shell: bash`).toMatch(/^ {8}shell: bash$/m);
    }
  });

  it('runs only when the job has already failed', () => {
    const yaml = readFileSync(workflowPath, 'utf8');
    const stepAt = yaml.indexOf(`- name: ${STEP_NAME}`);
    expect(yaml.slice(stepAt, stepAt + 200)).toContain('if: failure()');
  });
});

describe('isFullSha', () => {
  // A commit status can only be pinned to a full 40-character SHA, and this
  // is the script-side half of the same rule the workflow's fallback step
  // applies in shell. It was reachable from only ONE test, which passed
  // `undefined` — so relaxing the pattern to `/^[0-9a-f]+$/` left all 162
  // tests green (round-2 review, P2).
  it('accepts exactly 40 lowercase hex characters', () => {
    expect(isFullSha('a'.repeat(40))).toBe(true);
    expect(isFullSha('0123456789abcdef0123456789abcdef01234567')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of [
      'a'.repeat(39), // one short
      'a'.repeat(41), // one long
      'A'.repeat(40), // uppercase hex
      'g'.repeat(40), // 40 chars, outside the hex alphabet
      `${'a'.repeat(37)}../`, // 40 chars, a traversal
      'abc1234', // a short-SHA fragment
      '',
      undefined,
      null,
      42,
      { toString: () => 'a'.repeat(40) },
    ]) {
      expect(isFullSha(value), `expected ${JSON.stringify(value)} to be rejected`).toBe(false);
    }
  });
});

describe('a fetch LONGER than GitHub declares is also unusable', () => {
  it('rejects a count that overshoots, not just one that falls short', () => {
    // A path containing a literal newline splits into two entries, so a
    // truncated fetch can present a count that satisfies a `<` comparison.
    expect(fileListIsUnusable(1734, 1733)).toBe(true);
    expect(fileListIsUnusable(101, 100)).toBe(true);
  });
});
