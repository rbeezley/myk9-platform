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
 * Which workflow code ran: `pull_request_target` runs the workflow file from
 * the PR's base branch AT THE TIME, and the run API reports neither that
 * branch nor its commit (head_sha is the PR's; pull_requests[].base is the
 * PR's base now). A PR can target a branch carrying a modified copy of this
 * workflow, run it, then retarget main (Codex, #3284). The only unforgeable
 * record is the run's GitHub-signed OIDC token: its `workflow_ref` and
 * `workflow_sha` claims. The caller verifies that token's signature and
 * passes those claims; nothing a run wrote about itself stands in for them.
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
  };
  /** The run that produced the artifact, read from the API by run id. */
  run: {
    id: number;
    attempt: number;
    event: string;
    repository: string;
    headSha: string;
    /** From the run's verified OIDC token; null when there is none to verify. */
    workflowRef: string | null;
    workflowSha: string | null;
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
  const trustedRef = `${state.repository}/${TRUSTED_WORKFLOW}@refs/heads/${TRUSTED_BRANCH}`;
  if (run.workflowRef !== trustedRef) {
    return `run ${run.id} ran workflow ${run.workflowRef ?? '(unverified)'}, not ${trustedRef}`;
  }
  if (run.workflowSha === null || run.workflowSha !== attempt.workflowSha) {
    return `run ${run.id}'s signed workflow commit does not match the attempt's`;
  }
  if (run.repository !== state.repository) return `run ${run.id} belongs to ${run.repository}`;
  if (attempt.repository !== state.repository) return `attempt is for ${attempt.repository}`;
  if (attempt.runId !== run.id || attempt.runAttempt !== run.attempt) {
    return `attempt claims run ${attempt.runId}/${attempt.runAttempt}, artifact came from ${run.id}/${run.attempt}`;
  }
  if (attempt.pr !== pr.number) return `attempt is for PR ${attempt.pr}, not ${pr.number}`;
  if (run.event === 'pull_request_target') {
    if (run.headSha !== attempt.headSha) return `run ${run.id} was triggered for a different head`;
  } else if (run.event !== 'workflow_dispatch') {
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
