import {
  isPublishGateDbError,
  publishGateDbErrorMessage,
  PUBLISH_BLOCKED_MESSAGE,
} from '@/features/payments/onlineEntryGate';

export interface PublishTransitionGateParams {
  /** The show's status BEFORE this save (the store's current value, not the form's). */
  currentStatus: string | undefined;
  /** The status the form is about to save. */
  nextStatus: string | undefined;
  /** The AWAITED direct update (same path ShowStatusPill uses) -- never the
   * queued replication write, which only enqueues and cannot surface a DB
   * refusal to the caller. */
  publishShow: () => Promise<unknown>;
}

/**
 * MYK9-579: gate a draft->published transition against the DB trigger
 * (enforce_show_publish_gate) BEFORE the rest of an edit-panel save queues
 * through replication.
 *
 * queueMutation (MutationManager) only enqueues and resolves immediately, so a
 * DB refusal (SQLSTATE MK003) reached through the queued path would land in
 * FAILED_MUTATIONS silently minutes later -- after the panel already toasted
 * "Show changes saved" and the local store/IndexedDB already said 'published'.
 * Awaiting `publishShow` here means the refusal is thrown from THIS call, so
 * the caller (ShowManagementShell's onSave) never reaches the queued write and
 * EditPanelWrapper's existing catch (getErrorMessage) shows the friendly copy
 * with the panel still open -- exactly like ShowEditPanel's own client-side
 * gate.
 *
 * A no-op (does not call `publishShow` at all) for every save that is not a
 * transition INTO 'published' -- an already-published show's unrelated edits,
 * or a draft staying a draft, pass straight through untouched.
 */
export async function runPublishTransitionGate({
  currentStatus,
  nextStatus,
  publishShow,
}: PublishTransitionGateParams): Promise<void> {
  const newlyPublishing = nextStatus === 'published' && currentStatus !== 'published';
  if (!newlyPublishing) return;

  try {
    await publishShow();
  } catch (error) {
    if (isPublishGateDbError(error)) {
      throw new Error(publishGateDbErrorMessage(error) ?? PUBLISH_BLOCKED_MESSAGE);
    }
    throw error;
  }
}
