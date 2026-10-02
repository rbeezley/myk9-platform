/**
 * The shared vocabulary of the one client delete path (CRUD standard Phase 2,
 * docs/plan-crud-standard.md). Every delete of a core object goes through
 * `DeleteObjectDialog` and `deleteRecords` with one of these kinds.
 */

export type DeleteObjectKind = 'club' | 'show' | 'trial' | 'class' | 'entry' | 'dog' | 'person';

/**
 * Where the item sits. Used to refresh the right replica scopes after a delete
 * or an Undo, and to point a blocked delete at the right page (Cancel show,
 * Withdraw / Pull). Every field is optional: a missing one only narrows what is
 * refreshed, it never blocks the delete.
 */
export interface DeleteTargetContext {
  showId?: string | undefined;
  trialId?: string | undefined;
  classId?: string | undefined;
}

/** One item the user is about to delete, as the dialog names it. */
export interface DeleteTarget {
  id: string;
  /** The item's own name: show name, trial label, class title, dog call name … */
  name: string;
  /** ONE identifying detail (see `deleteDetail.ts`), e.g. "Oct 10–11, 2026 · Heartland KC". */
  detail?: string | undefined;
  context?: DeleteTargetContext | undefined;
}

/**
 * What `delete_preview` reports for one item (migration 20261001233700): the
 * live rows that go with it, how many of its entries are paid or scored, and how
 * many rows make the server refuse the delete.
 */
export interface DeletePreview {
  trials: number;
  classes: number;
  entries: number;
  shows: number;
  dogs: number;
  paid: number;
  scored: number;
  blocking: number;
}

/** Why the counts are not known. Each one keeps Delete disabled and says so. */
export type DeletePreviewUnavailableReason = 'offline' | 'forbidden' | 'failed';

/**
 * The three things the dialog can know: nothing yet, something that went wrong,
 * or the counts. Unknown is never zero — a count that has not arrived must not
 * enable a delete the server may refuse (same rule as `blockingEntryCount.ts`).
 */
export type DeletePreviewState =
  | { status: 'pending' }
  | { status: 'unavailable'; reason: DeletePreviewUnavailableReason; isRetrying: boolean }
  | { status: 'ready'; preview: DeletePreview };

/** The dialog's three states, derived from the preview. */
export type DeleteGate = 'unknown' | 'blocked' | 'allowed';

export function deleteGateOf(state: DeletePreviewState): DeleteGate {
  if (state.status !== 'ready') return 'unknown';
  return state.preview.blocking > 0 ? 'blocked' : 'allowed';
}

/** The undo window the server grants the deleter (private.can_undo_soft_delete). */
export const UNDO_WINDOW_MS = 10 * 60 * 1000;
