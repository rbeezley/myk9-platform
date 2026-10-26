import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildReviewAttempt,
  outcomeFromWrapper,
  parseReviewAttempt,
  type ReviewAttempt,
} from './review-attempt.ts';

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const WORKFLOW = 'c'.repeat(40);
const CLEAN_LOG = Buffer.from('No actionable defects found. Reviewed the whole branch.\n');

const IDENTITY = {
  repository: 'rbeezley/myk9-platform',
  pr: 3300,
  baseSha: BASE,
  headSha: HEAD,
  implementer: 'codex',
  reviewer: 'claude',
  workflowSha: WORKFLOW,
  runId: 40351720197,
  runAttempt: 1,
} as const;

function attempt(overrides: Partial<ReviewAttempt> = {}): ReviewAttempt {
  return {
    ...IDENTITY,
    outcome: 'clean',
    wrapperExit: 0,
    logDigest: createHash('sha256').update(CLEAN_LOG).digest('hex'),
    ...overrides,
  };
}

describe('outcomeFromWrapper', () => {
  // The wrapper's own exit contract (claude-review.sh / codex-review.sh
  // headers): 0 clean, 1 findings, 2 did not complete, 3 still running.
  it('takes 0 as clean and 1 as findings when there is a log', () => {
    expect(outcomeFromWrapper({ exit: 0, timedOut: false, log: CLEAN_LOG })).toBe('clean');
    expect(outcomeFromWrapper({ exit: 1, timedOut: false, log: CLEAN_LOG })).toBe('findings');
  });

  it.each([
    ['exit 2 (usage limit, interrupted, unrecognized)', 2],
    ['exit 3 (still running)', 3],
    ['an unknown exit', 7],
    ['a sandbox kill (128+SIGURG)', 144],
    ['death by signal (no exit code)', null],
  ])('takes %s as incomplete', (_label, exit) => {
    expect(outcomeFromWrapper({ exit, timedOut: false, log: CLEAN_LOG })).toBe('incomplete');
  });

  it('takes a timeout as incomplete even when the wrapper had exited 0', () => {
    expect(outcomeFromWrapper({ exit: 0, timedOut: true, log: CLEAN_LOG })).toBe('incomplete');
  });

  it.each([
    ['a missing log', null],
    ['an empty log', Buffer.alloc(0)],
  ])('takes %s as incomplete, whatever the exit', (_label, log) => {
    expect(outcomeFromWrapper({ exit: 0, timedOut: false, log })).toBe('incomplete');
    expect(outcomeFromWrapper({ exit: 1, timedOut: false, log })).toBe('incomplete');
  });
});

describe('buildReviewAttempt', () => {
  it('records the outcome, the raw exit and the sha256 of the log, in post-review-gate form', () => {
    const built = buildReviewAttempt({
      ...IDENTITY,
      wrapper: { exit: 0, timedOut: false, log: CLEAN_LOG },
    });
    expect(built).toEqual(attempt());
    expect(built.logDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps no digest when there is no log to hash', () => {
    expect(
      buildReviewAttempt({ ...IDENTITY, wrapper: { exit: null, timedOut: true, log: null } })
    ).toEqual(attempt({ outcome: 'incomplete', wrapperExit: null, logDigest: null }));
  });
});

describe('parseReviewAttempt', () => {
  it('accepts an attempt that round-trips through JSON', () => {
    const value = attempt();
    expect(parseReviewAttempt(JSON.parse(JSON.stringify(value)))).toEqual(value);
  });

  it('accepts an incomplete attempt with no log', () => {
    const value = attempt({ outcome: 'incomplete', wrapperExit: 2, logDigest: null });
    expect(parseReviewAttempt(value)).toEqual(value);
  });

  it.each<[string, unknown]>([
    ['a non-object', 'clean'],
    ['null', null],
    ['an extra key', { ...attempt(), approved: true }],
    ['a missing key', (({ runAttempt: _omit, ...rest }) => rest)(attempt())],
    ['a short head SHA', attempt({ headSha: 'b'.repeat(9) })],
    ['an uppercase SHA', attempt({ baseSha: 'A'.repeat(40) })],
    ['a repository without an owner', attempt({ repository: 'myk9-platform' })],
    ['a PR number of 0', attempt({ pr: 0 })],
    ['a fractional run attempt', attempt({ runAttempt: 1.5 })],
    ['an unknown harness', attempt({ reviewer: 'gemini' as never })],
    ['a harness reviewing its own work', attempt({ reviewer: 'codex' })],
    ['an unknown outcome', attempt({ outcome: 'approved' as never })],
    ['a clean outcome with no digest', attempt({ logDigest: null })],
    ['a clean outcome from exit 1', attempt({ wrapperExit: 1 })],
    ['findings from exit 0', attempt({ outcome: 'findings' })],
    ['a malformed digest', attempt({ logDigest: 'sha256:abc' })],
  ])('rejects %s', (_label, value) => {
    expect(parseReviewAttempt(value)).toEqual({ invalid: expect.any(String) });
  });
});
