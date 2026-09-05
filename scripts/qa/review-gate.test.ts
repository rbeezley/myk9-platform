import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clampDescription,
  evaluateReviewGate,
  parseGateComments,
  REVIEW_GATE_LINE,
  verdictAccepted,
  type GateComment,
} from './review-gate';

const HEAD = '5af9af1585c4376ffbb648600ba5a22c8e009743';
const OLD_HEAD = '4100e2f8daf6ac70a043aeb9eb9370e9cbce95f9';
const H9 = HEAD.slice(0, 9);

function comment(body: string, createdAt = '2026-09-05T16:00:00Z'): GateComment {
  return { body, createdAt, author: 'rbeezley' };
}

describe('evaluateReviewGate', () => {
  it('fails with no review recorded at all', () => {
    const r = evaluateReviewGate({ headSha: HEAD, comments: [] });
    expect(r.state).toBe('failure');
    expect(r.description).toContain(H9);
  });

  it('fails when the only review is for an EARLIER head (#2040)', () => {
    // The review ran, and it was even clean — but a push moved the head after
    // it. That is the merge-while-review-runs hole: evidence for a previous
    // SHA must not count for this one.
    const r = evaluateReviewGate({
      headSha: HEAD,
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
      comments: [comment(`Review gate: codex reviewed 0a2020c7a..${H9} — no findings`)],
    });
    expect(r.state).toBe('success');
    expect(r.evidence?.reviewer).toBe('codex');
    expect(r.description).toContain('no findings');
  });

  it('passes when findings were reported AND addressed', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
      comments: [
        comment(`Review gate: claude reviewed 0a2020c7a..${H9} — 2 findings, all addressed`),
      ],
    });
    expect(r.state).toBe('success');
  });

  it('fails when the review did not actually run, even if a line was posted', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
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
  ])('rejects the near-miss verdict %j — the grammar is exact, not substring', verdict => {
    // Codex's review of #2058: a substring check accepted several of these as
    // green. A negation or a qualifier inside the verdict must fail.
    expect(verdictAccepted(verdict)).toBe(false);
    const r = evaluateReviewGate({
      headSha: HEAD,
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

  it('ignores the format when it is quoted, indented, or backticked — prose is not evidence', () => {
    const r = evaluateReviewGate({
      headSha: HEAD,
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
      const r = evaluateReviewGate({ headSha: ex[3].padEnd(40, '0'), comments: [comment(ex[0])] });
      expect(r.state, ex[0]).toBe('success');
    }
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

  it('scopes concurrency to the job, so a skipped run cannot cancel an evaluation', () => {
    // A workflow-level group is claimed even by runs whose only job the `if`
    // skips — an ordinary comment then cancels an in-flight evaluation.
    expect(workflow).not.toMatch(/^concurrency:/m);
    expect(workflow).toMatch(/^    concurrency:\n\s+group: review-gate-/m);
  });

  it('re-evaluates on every push', () => {
    expect(workflow).toMatch(/pull_request:\n\s+types: \[[^\]]*synchronize[^\]]*\]/);
  });
});

describe('clampDescription', () => {
  it('keeps GitHub status descriptions within 140 characters', () => {
    expect(clampDescription('x'.repeat(140))).toHaveLength(140);
    expect(clampDescription('x'.repeat(200))).toHaveLength(140);
    expect(clampDescription('x'.repeat(200))).toMatch(/\.\.\.$/);
  });
});
