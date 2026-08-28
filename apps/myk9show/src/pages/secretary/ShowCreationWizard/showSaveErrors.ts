/**
 * Distinguishes "the show was not created" from "the show WAS created but its
 * officials could not be granted".
 *
 * Both used to surface as a bare `Error`, which produced two bugs at once:
 *
 *  1. The wizard rendered `Failed to create show: The show was created but
 *     officials could not be set...` — a sentence that contradicts itself, and
 *     which in the legacy path was doubly wrong because the catch block then
 *     soft-deleted the very show the message said existed.
 *  2. Presenting a completed create as a failure invites the secretary to press
 *     the button again. `buildCreateShowPayload` mints a fresh
 *     `crypto.randomUUID()` per call, so the second press creates a SECOND
 *     complete show rather than retrying the first.
 *
 * A show that exists but is missing role grants is a partial success: keep it,
 * navigate to it, and say plainly what still needs doing.
 */
export class OfficialsNotAssignedError extends Error {
  readonly showId: string;
  readonly failedCount: number;

  constructor(showId: string, failedCount: number) {
    super(
      `${failedCount} official role${failedCount === 1 ? '' : 's'} could not be assigned to show ${showId}`
    );
    this.name = 'OfficialsNotAssignedError';
    this.showId = showId;
    this.failedCount = failedCount;
  }
}

export function isOfficialsNotAssignedError(error: unknown): error is OfficialsNotAssignedError {
  return error instanceof OfficialsNotAssignedError;
}

/** User-facing copy for a show that saved without its official assignments. */
export function officialsNotAssignedMessage(failedCount: number): string {
  return `Your show was created, but ${failedCount} official assignment${
    failedCount === 1 ? '' : 's'
  } didn’t go through. The show is saved — assign them from the show’s Officials tab. Don’t create the show again.`;
}
