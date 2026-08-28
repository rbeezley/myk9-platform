import type { ShowPasscodes } from '@myk9/core';
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
/**
 * The parts of a completed create that exist exactly once. `insert_show_passcodes`
 * returns plaintexts that are never recoverable (only HMAC hashes are stored), so
 * an error thrown after that point MUST carry them or the show loses its access
 * codes for good.
 */
export interface PartialCreatePayload {
  showName: string;
  passcodes: ShowPasscodes | null;
  passcodeError: string | null;
}

export class OfficialsNotAssignedError extends Error {
  readonly showId: string;
  readonly failedCount: number;
  readonly partial: PartialCreatePayload | undefined;

  constructor(showId: string, failedCount: number, partial?: PartialCreatePayload) {
    super(
      `${failedCount} official role${failedCount === 1 ? '' : 's'} could not be assigned to show ${showId}`
    );
    this.name = 'OfficialsNotAssignedError';
    this.showId = showId;
    this.failedCount = failedCount;
    this.partial = partial;
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

/**
 * Completes a save that produced a real show but not all of its role grants.
 *
 * Kept beside the error because the ordering matters: the atomic path throws
 * AFTER `insert_show_passcodes`, so the plaintexts are in hand and cannot be
 * regenerated from this response. Routing to the success overlay (which is the
 * only surface that displays them) rather than navigating past it is the whole
 * reason the error carries a payload.
 */
export function completePartialShowSave(
  error: OfficialsNotAssignedError,
  ctx: {
    warn: (message: string) => void;
    resetWizard: () => void;
    navigate: (path: string) => void;
    onCreated?:
      | ((
          showId: string,
          showName: string,
          passcodes: ShowPasscodes | null,
          passcodeError?: string | null
        ) => void)
      | undefined;
  }
): void {
  ctx.warn(officialsNotAssignedMessage(error.failedCount));
  ctx.resetWizard();

  if (error.partial && ctx.onCreated) {
    ctx.onCreated(
      error.showId,
      error.partial.showName,
      error.partial.passcodes,
      error.partial.passcodeError
    );
    return;
  }

  ctx.navigate(`/shows/${error.showId}`);
}
