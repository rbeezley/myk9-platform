/**
 * The publisher's last check before a cloud review becomes PR evidence
 * (MYK9-1398; docs/plan-cloud-agent-workflow.md Task 2.1). The publisher runs
 * no model and no PR code; it reads the attempt artifact, gathers the facts
 * below from the GitHub API itself, and only then hands the original log to
 * post-review-gate.sh.
 *
 * Three ways to say no, checked in this order so a forged record can never be
 * reported as a mere staleness:
 *   1. Untrusted: the record or run does not verify. Post nothing; fail loud.
 *   2. Stale: closed, back to draft, head moved, or a newer attempt exists.
 *      Post nothing; the current head's own attempt speaks for it.
 *   3. Not completed: trusted and current, but no verifiable verdict. The
 *      caller posts one `Review not completed for <head>` note (Task 2.2).
 *
 * Which workflow code ran: for `pull_request_target` GitHub runs the workflow
 * file from the PR's base branch, and reports the run's head_branch/head_sha
 * as the PR's, so the base being `main` is the proof. A `workflow_dispatch`
 * run reports the ref it was dispatched on, which must be `main`.
 */
import type { Harness } from './authorship.ts';
import type { ReviewAttempt } from './review-attempt.ts';

export const TRUSTED_WORKFLOW = '.github/workflows/cloud-independent-review.yml';
const TRUSTED_BRANCH = 'main';

/** Owner decision 2026-10-26: the cloud runs only Claude; Codex reviews on the Mac. */
export const CLOUD_REVIEWERS: readonly Harness[] = ['claude'];

export type PublicationState = {
  repository: string;
  pr: {
    number: number;
    state: 'open' | 'closed';
    draft: boolean;
    headSha: string;
    baseRef: string;
  };
  /** The run that produced the artifact, read from the API by run id. */
  run: {
    id: number;
    attempt: number;
    event: string;
    path: string;
    repository: string;
    headBranch: string;
    headSha: string;
  };
  /** Newest trusted cloud attempt for this PR and head; null if none is recorded. */
  latestAttempt: { runId: number; runAttempt: number } | null;
  /** The downloaded log's sha256, computed by the publisher; null if missing. */
  artifact: { logDigest: string } | null;
};

export type Publication =
  { publish: 'clean' | 'findings' } | { reject: string; notCompleted: boolean };

function untrustedReason(attempt: ReviewAttempt, state: PublicationState): string | null {
  const { run, pr } = state;
  if (run.path !== TRUSTED_WORKFLOW)
    return `run ${run.id} is workflow ${run.path}, not ${TRUSTED_WORKFLOW}`;
  if (run.repository !== state.repository) return `run ${run.id} belongs to ${run.repository}`;
  if (attempt.repository !== state.repository) return `attempt is for ${attempt.repository}`;
  if (attempt.runId !== run.id || attempt.runAttempt !== run.attempt) {
    return `attempt claims run ${attempt.runId}/${attempt.runAttempt}, artifact came from ${run.id}/${run.attempt}`;
  }
  if (attempt.pr !== pr.number) return `attempt is for PR ${attempt.pr}, not ${pr.number}`;
  if (run.event === 'pull_request_target') {
    if (pr.baseRef !== TRUSTED_BRANCH)
      return `PR targets ${pr.baseRef}, so its workflow is not ${TRUSTED_BRANCH}'s`;
    if (run.headSha !== attempt.headSha) return `run ${run.id} was triggered for a different head`;
  } else if (run.event === 'workflow_dispatch') {
    if (run.headBranch !== TRUSTED_BRANCH)
      return `run ${run.id} was dispatched from ${run.headBranch}`;
  } else {
    return `run ${run.id} came from a ${run.event} event`;
  }
  if (!CLOUD_REVIEWERS.includes(attempt.reviewer))
    return `the cloud does not run ${attempt.reviewer} reviews`;
  return null;
}

function staleReason(attempt: ReviewAttempt, state: PublicationState): string | null {
  const { pr, latestAttempt: latest } = state;
  if (pr.state !== 'open') return `PR ${pr.number} is ${pr.state}`;
  if (pr.draft) return `PR ${pr.number} is a draft again`;
  if (pr.headSha !== attempt.headSha) return `PR head moved to ${pr.headSha.slice(0, 9)}`;
  // Fail closed: with no record of the newest attempt, this one cannot claim to be it.
  if (!latest || latest.runId !== attempt.runId || latest.runAttempt !== attempt.runAttempt) {
    return `attempt ${attempt.runId}/${attempt.runAttempt} is not the latest for this head`;
  }
  return null;
}

export function validateReviewPublication(
  attempt: ReviewAttempt,
  state: PublicationState
): Publication {
  const untrusted = untrustedReason(attempt, state);
  if (untrusted) return { reject: `untrusted: ${untrusted}`, notCompleted: false };
  const stale = staleReason(attempt, state);
  if (stale) return { reject: `stale: ${stale}`, notCompleted: false };

  if (attempt.outcome === 'incomplete') {
    return {
      reject: `review did not complete (wrapper exit ${attempt.wrapperExit})`,
      notCompleted: true,
    };
  }
  if (!state.artifact) return { reject: 'review log artifact is missing', notCompleted: true };
  if (state.artifact.logDigest !== attempt.logDigest) {
    return { reject: 'review log does not match its recorded digest', notCompleted: true };
  }
  return { publish: attempt.outcome };
}
