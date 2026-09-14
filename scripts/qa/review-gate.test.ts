import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clampDescription,
  evaluateReviewGate,
  flattenPages,
  overrideAccepted,
  parseGateComments,
  REVIEW_GATE_LINE,
  REVIEWER_TOKENS,
  HUMAN_FALLBACK_ASSOCIATIONS,
  humanFallbackAccepted,
  requiredChecksResult,
  tierForReviewer,
  TRUSTED_ASSOCIATIONS,
  verdictAccepted,
  type GateComment,
} from './review-gate';
import { MIGRATION_LENS, TIER_ORDER } from './review-tier';

const HEAD = '5af9af1585c4376ffbb648600ba5a22c8e009743';
const OLD_HEAD = '4100e2f8daf6ac70a043aeb9eb9370e9cbce95f9';
const H9 = HEAD.slice(0, 9);

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

  it('passes the documented human fallback with two adversarial reviews', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      changedFiles: [],
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
    expect(r.state).toBe('success');
    expect(r.evidence?.reviewer).toBe('human-fallback');
  });

  it.each(['one adversarial review', 'missing required checks', 'untrusted maintainer claim'])(
    'rejects an incomplete human fallback: %s',
    scenario => {
      const lines = [
        `Review gate: human-fallback reviewed 0a2020c7a..${H9} — 2 adversarial subagent reviews, all findings addressed`,
        'Fallback reason: Claude unavailable — authentication failure',
        'Adversarial subagent review: correctness and data flow',
        'Adversarial subagent review: security and migration safety',
        'Required checks: passing',
      ];
      if (scenario === 'one adversarial review') lines.splice(3, 1);
      if (scenario === 'missing required checks') lines.splice(4, 1);
      const association = scenario === 'untrusted maintainer claim' ? 'COLLABORATOR' : 'OWNER';
      const r = evaluateReviewGate({
        headSha: HEAD,
        changedFiles: [],
        comments: [comment(lines.join('\n'), undefined, undefined, association)],
      });
      expect(r.state).toBe('failure');
    }
  );

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
    expect(evidence[1].head).toBe(HEAD);
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
      const body =
        ex[1] === 'human-fallback'
          ? [
              ex[0],
              'Fallback reason: Claude unavailable — authentication failure',
              'Adversarial subagent review: correctness',
              'Adversarial subagent review: security',
              'Required checks: passing',
            ].join('\n')
          : ex[0];
      const r = evaluateReviewGate({
        headSha: ex[3].padEnd(40, '0'),
        changedFiles: [],
        comments: [comment(body)],
      });
      expect(r.state, ex[0]).toBe('success');
    }
  });
});

describe('human fallback policy', () => {
  it('limits fallback authorization to owners and members', () => {
    expect([...HUMAN_FALLBACK_ASSOCIATIONS]).toEqual(['OWNER', 'MEMBER']);
  });

  it('does not treat a normal clean review as a human fallback', () => {
    const evidence = parseGateComments([
      comment(`Review gate: claude reviewed 0a2020c7a..${H9} — no findings`),
    ])[0];
    expect(humanFallbackAccepted(evidence)).toBe(false);
  });

  it('requires a concrete reason for Claude unavailability', () => {
    const evidence = parseGateComments([
      comment(
        [
          `Review gate: human-fallback reviewed 0a2020c7a..${H9} — 2 adversarial subagent reviews, all findings addressed`,
          'Fallback reason: Claude unavailable',
          'Adversarial subagent review: correctness',
          'Adversarial subagent review: security',
          'Required checks: passing',
        ].join('\n')
      ),
    ])[0];
    expect(humanFallbackAccepted(evidence)).toBe(false);
  });
});

describe('required check verification', () => {
  it('accepts passing check runs and status contexts', () => {
    expect(
      requiredChecksResult(
        [
          { name: 'Quality Checks', conclusion: 'SUCCESS' },
          { context: 'Test', state: 'SUCCESS' },
          { name: 'Review gate', conclusion: 'FAILURE' },
        ],
        ['Quality Checks', 'Test', 'Review gate']
      )
    ).toEqual({ pending: [], failed: [] });
  });

  it('does not treat the review gate itself as a required prerequisite', () => {
    expect(
      requiredChecksResult([{ name: 'Review gate', conclusion: 'FAILURE' }], ['Review gate'])
    ).toEqual({ pending: [], failed: [] });
  });

  it('reports missing and in-flight checks as pending', () => {
    expect(
      requiredChecksResult(
        [{ name: 'Quality Checks', conclusion: null, state: 'IN_PROGRESS' }],
        ['Quality Checks', 'Test']
      )
    ).toEqual({ pending: ['Quality Checks', 'Test'], failed: [] });
  });

  it('fails closed on failed or unknown conclusions', () => {
    expect(
      requiredChecksResult(
        [
          { name: 'Quality Checks', conclusion: 'FAILURE' },
          { name: 'Test', conclusion: 'SOME_FUTURE_VALUE' },
        ],
        ['Quality Checks', 'Test']
      )
    ).toEqual({ pending: [], failed: ['Quality Checks', 'Test'] });
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
    const types = issueComment![1].split(',').map(t => t.trim());
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
    const [evidence] = parseGateComments([
      comment(`Review gate: codex reviewed abc1234..${HEAD} — no findings`),
    ]);
    expect(evidence.tier).toBe('independent');
    expect(evidence.reviewer).toBe('codex');
  });

  it('parses an explicit tier token', () => {
    const [evidence] = parseGateComments([
      comment(
        `Review gate: adversarial reviewed abc1234..${HEAD} — 2 lenses, all findings addressed`
      ),
    ]);
    expect(evidence.tier).toBe('adversarial');
  });

  it('parses the none tier', () => {
    const [evidence] = parseGateComments([
      comment(`Review gate: none reviewed abc1234..${HEAD} — low-risk paths, CI green`),
    ]);
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

  it('exempts a CONFIRMED human fallback from the floor, even below adversarial', () => {
    // `human-fallback` maps to tier `owner`, which sits BELOW the
    // `adversarial` floor that application code computes. Task 4 formalises
    // override semantics on top of this; for now a confirmed human-fallback
    // attestation (association, two lenses, passing checks — the full
    // contract `humanFallbackAccepted` checks) is exempt.
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
    expect(result.state).toBe('success');
  });

  it('refuses a COLLABORATOR-authored bare "owner" line on a guardrail path (C1)', () => {
    // Codex review of Task 3 round 1: the ORIGINAL exemption keyed off
    // `latest.tier === 'owner'` unconditionally, which the bare `owner`
    // reviewer token also maps to — but `owner` is gated only by
    // `commentTrusted` (OWNER/MEMBER/COLLABORATOR), never by
    // `HUMAN_FALLBACK_ASSOCIATIONS` (OWNER/MEMBER only) or the two-lens
    // contract. A COLLABORATOR could post `Review gate: owner reviewed
    // …  — no findings` on a PR rewriting review-gate.ts itself and pass.
    // Corrected: only a CONFIRMED human-fallback (the test above) is exempt;
    // the bare `owner` token gets no exemption and, since it has no entry in
    // VERDICT_BY_TIER, is refused as "not clean" regardless of the floor.
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

    it.each([
      '2 lens, all findings addressed',
      '2 lenses, all findings addressed',
      '10 lenses, all findings addressed',
    ])('accepts %j — (lens|lenses) both work once the count is >= 2 (M1)', verdict => {
      const result = evaluateReviewGate({
        headSha: HEAD,
        comments: [comment(adversarialBody(verdict))],
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

  it('leaves the legacy human-fallback body contract unchanged', () => {
    // PR #2241 is live on this token; its body has no `adversarial` evidence
    // line and must keep passing exactly as it did.
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
      changedFiles: ['supabase/migrations/20260914174500_x.sql'],
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
    // `overrideAccepted` checks `HUMAN_FALLBACK_ASSOCIATIONS` (OWNER/MEMBER
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

  it('the legacy human-fallback evidence form keeps working unchanged', () => {
    // OVERRIDE_REASON is a NEW, separate contract for the bare `owner`
    // token; `FALLBACK_REASON` (the `human-fallback` token's own contract,
    // still hardcoded to "Fallback reason: Claude unavailable") is untouched.
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
      changedFiles: ['scripts/qa/review-gate.ts'],
    });
    expect(result.state).toBe('success');
  });
});
