import { describe, expect, it } from 'vitest';
import type { ReviewAttempt } from './review-attempt.ts';
import {
  TRUSTED_WORKFLOW,
  validateReviewPublication,
  type PublicationState,
} from './review-publication.ts';

const HEAD = 'b'.repeat(40);
const DIGEST = 'd'.repeat(64);

const ATTEMPT: ReviewAttempt = {
  repository: 'rbeezley/myk9-platform',
  pr: 3300,
  baseSha: 'a'.repeat(40),
  headSha: HEAD,
  implementer: 'codex',
  reviewer: 'claude',
  workflowSha: 'c'.repeat(40),
  runId: 500,
  runAttempt: 1,
  outcome: 'clean',
  wrapperExit: 0,
  logDigest: DIGEST,
};

// What the publisher reads back from the API, for a pull_request_target run.
// GitHub reports such a run's head_branch/head_sha as the PR's, not main's.
function state(
  overrides: {
    pr?: Partial<PublicationState['pr']>;
    run?: Partial<PublicationState['run']>;
    latestAttempt?: PublicationState['latestAttempt'];
    artifact?: PublicationState['artifact'];
  } = {}
): PublicationState {
  return {
    repository: 'rbeezley/myk9-platform',
    pr: {
      number: 3300,
      state: 'open',
      draft: false,
      headSha: HEAD,
      baseRef: 'main',
      ...overrides.pr,
    },
    run: {
      id: 500,
      attempt: 1,
      event: 'pull_request_target',
      path: TRUSTED_WORKFLOW,
      repository: 'rbeezley/myk9-platform',
      headBranch: 'codex/some-fix',
      headSha: HEAD,
      ...overrides.run,
    },
    latestAttempt:
      'latestAttempt' in overrides ? overrides.latestAttempt! : { runId: 500, runAttempt: 1 },
    artifact: 'artifact' in overrides ? overrides.artifact! : { logDigest: DIGEST },
  };
}

const untrusted = { reject: expect.any(String), notCompleted: false };

describe('validateReviewPublication', () => {
  it('publishes a clean attempt from the trusted workflow on the current head', () => {
    expect(validateReviewPublication(ATTEMPT, state())).toEqual({ publish: 'clean' });
  });

  it('publishes findings the same way, so they can withdraw earlier evidence', () => {
    const findings = { ...ATTEMPT, outcome: 'findings' as const, wrapperExit: 1 };
    expect(validateReviewPublication(findings, state())).toEqual({ publish: 'findings' });
  });

  it('accepts a manual dispatch from main', () => {
    expect(
      validateReviewPublication(
        ATTEMPT,
        state({ run: { event: 'workflow_dispatch', headBranch: 'main', headSha: 'c'.repeat(40) } })
      )
    ).toEqual({ publish: 'clean' });
  });

  describe('refuses provenance it cannot verify, and posts nothing', () => {
    it.each<[string, Parameters<typeof state>[0], Partial<ReviewAttempt>?]>([
      ['another workflow file', { run: { path: '.github/workflows/ci.yml' } }],
      ['a run in another repository', { run: { repository: 'fork/myk9-platform' } }],
      ['an attempt claiming another run', {}, { runId: 499 }],
      ['an attempt claiming another run attempt', {}, { runAttempt: 2 }],
      ['an attempt for another repository', {}, { repository: 'someone/else' }],
      ['an attempt for another PR', {}, { pr: 3301 }],
      ['an untrusted event', { run: { event: 'pull_request' } }],
      ['a PR targeting a branch other than main', { pr: { baseRef: 'codex/stack-base' } }],
      ['a pull_request_target run for a different head', { run: { headSha: 'e'.repeat(40) } }],
      [
        'a dispatch from a branch other than main',
        { run: { event: 'workflow_dispatch', headBranch: 'codex/x' } },
      ],
      ['a reviewer the cloud does not run', {}, { implementer: 'claude', reviewer: 'codex' }],
    ])('%s', (_label, stateOverrides, attemptOverrides = {}) => {
      expect(
        validateReviewPublication({ ...ATTEMPT, ...attemptOverrides }, state(stateOverrides))
      ).toEqual(untrusted);
    });
  });

  describe('drops a stale attempt, and posts nothing', () => {
    it.each<[string, Parameters<typeof state>[0]]>([
      ['the PR was closed', { pr: { state: 'closed' } }],
      ['the PR went back to draft', { pr: { draft: true } }],
      ['a push moved the head', { pr: { headSha: 'f'.repeat(40) } }],
      ['a newer run superseded it', { latestAttempt: { runId: 501, runAttempt: 1 } }],
      ['a rerun of the same run superseded it', { latestAttempt: { runId: 500, runAttempt: 2 } }],
    ])('%s', (_label, stateOverrides) => {
      expect(validateReviewPublication(ATTEMPT, state(stateOverrides))).toEqual(untrusted);
    });
  });

  describe('reports a trusted, current attempt that did not finish as not completed', () => {
    it.each<[string, Parameters<typeof state>[0], Partial<ReviewAttempt>?]>([
      ['an incomplete outcome', {}, { outcome: 'incomplete', wrapperExit: 2, logDigest: null }],
      ['a missing artifact', { artifact: null }],
      [
        'a log that does not match its recorded digest',
        { artifact: { logDigest: 'e'.repeat(64) } },
      ],
    ])('%s', (_label, stateOverrides, attemptOverrides = {}) => {
      expect(
        validateReviewPublication({ ...ATTEMPT, ...attemptOverrides }, state(stateOverrides))
      ).toEqual({
        reject: expect.any(String),
        notCompleted: true,
      });
    });
  });

  it('checks provenance before staleness: an untrusted run on a moved head is untrusted', () => {
    const result = validateReviewPublication(
      ATTEMPT,
      state({ run: { path: '.github/workflows/ci.yml' }, pr: { headSha: 'f'.repeat(40) } })
    );
    expect(result).toEqual({ reject: expect.stringContaining('workflow'), notCompleted: false });
  });

  it('treats a missing latest-attempt record as superseded, never as current', () => {
    expect(validateReviewPublication(ATTEMPT, state({ latestAttempt: null }))).toEqual(untrusted);
  });
});
