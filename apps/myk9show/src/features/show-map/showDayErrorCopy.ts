/**
 * MYK9-1844: what the show-day screens (the Show Map, its run order panel and the
 * Check-in desk) say when an action fails. Each is the fallback passed to
 * `getUserFriendlyError`, so a mapped database code keeps its curated sentence and
 * anything else names what failed. These writes go through replication (saved on
 * this device, then sent) or an RPC, so a failure can come after the change landed:
 * the sentences say to check before trying again rather than claiming nothing changed.
 */
import { GENERIC_FAILURE_MESSAGE, getUserFriendlyError } from '@/utils/errorMessages';
import { MOVE_BACK_FAILED, MOVE_UP_FAILED } from '@/services/replication/moveUpEntryRpc';
import type { ShowMapActionMutationKey } from './showMapActionExecution';

/** The Show Map's one-press actions; check-in is shown at once and put back on failure. */
export const SHOW_MAP_MUTATION_FAILED: Record<ShowMapActionMutationKey, string> = {
  'mark-class-started':
    "We couldn't mark this class started. Check the class before you try again.",
  'mark-class-complete':
    "We couldn't mark this class complete. Check the class before you try again.",
  'mark-checked-in': "We couldn't check in this dog. Check the dog's status before you try again.",
};

export const SHOW_MAP_COPY = {
  pullFailed: "We couldn't pull this entry. Check the entry's status before you try again.",
  pullUndoFailed: "We couldn't undo the pull. Check the entry's status before you try again.",
  /**
   * The executor's 8-second undo goes through the same move-back RPC. No screen calls
   * it today, so the sentence names no control.
   */
  moveUpUndoFailed: MOVE_BACK_FAILED,
  moveUpFailed: MOVE_UP_FAILED,
  messageFailed: "We couldn't send this message. Check the conversation before you send it again.",
} as const;

export const RUN_ORDER_COPY = {
  /** The sort reads and plans before it writes; a failure there moved nobody. */
  sortFailed: "We couldn't sort the run order for this class. No dogs were moved. Try again.",
  placeFailed: "We couldn't move this dog in the run order. No dogs were moved. Try again.",
  /** Some dogs may already be back in their old places. The Undo banner stays up. */
  undoFailed:
    "We couldn't put the whole run order back. Check the run order, then press Undo again.",
} as const;

/** A show-day refusal worded for the secretary on purpose; shown as it is. */
export class ShowDayRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShowDayRefusal';
  }
}

/** The sentence for a failed show-day action: a worded refusal, a mapped code, or the fallback (also used when the code maps only to the generic sentence). */
export function showDayErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ShowDayRefusal) return error.message;
  const message = getUserFriendlyError(error, fallback);
  // The generic "Try again" is less useful than the fallback, which says what to check.
  return message === GENERIC_FAILURE_MESSAGE ? fallback : message;
}

/** Check-in desk sentences, naming the dog and the class. */
export const deskPullCopy = {
  pullFailed: (dog: string, className: string) =>
    `We couldn't pull ${dog} from ${className}. Check ${dog}'s status before you try again.`,
  undoFailed: (dog: string, className: string) =>
    `We couldn't undo the pull of ${dog} from ${className}. Check ${dog}'s status before you try again.`,
  putBackFailed: (dog: string, className: string) =>
    `We couldn't put ${dog} back in ${className}. Check ${dog}'s status before you try again.`,
  clearFlagFailed: (dog: string, className: string) =>
    `We couldn't clear the pull flag for ${dog} in ${className}. Check ${dog}'s status before you try again.`,
};
