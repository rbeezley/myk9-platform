/**
 * Prune saved wizard drafts for entries that have just been filed, from
 * OUTSIDE the wizard (MYK9-509).
 *
 * Cart checkout used to delete the draft the moment the lines reached the
 * cart — before Stripe had even loaded — which is why a cancelled checkout
 * left the exhibitor with nothing to come back to. The draft now survives the
 * hand-off, so something has to retire it once the payment actually succeeds,
 * and that "something" is the checkout-success page, which never mounts the
 * wizard and so cannot call `discardDraftsWithoutFinalSave`.
 *
 * This reuses `pruneStoredDrafts` rather than clearing the bucket, because a
 * cart is not always the whole draft: a dog with one class paid for and one
 * class denied must keep the denied line for recovery.
 */

import { makeHandlerKey } from '@/types/show-registration-types';
import { logger } from '@/services/LoggingService';
import type { DraftMetadata } from './draftMetadata';

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));
import { pruneStoredDrafts, type HandledDraftClass } from './pruneFiledDogsFromDraft';
import { DRAFT_STORAGE_KEY_PREFIX, draftKey, draftMetadataKey } from './draftStorageKeys';
import { clearWizardSession } from './wizardDraftSession';

export interface PruneWizardDraftsInput {
  showId: string;
  /** The auth user id the wizard saved under (`user.id`), not a people.id. */
  userId: string;
  filed: readonly HandledDraftClass[];
}

export function pruneWizardDraftsForFiledEntries({
  showId,
  userId,
  filed,
}: PruneWizardDraftsInput): void {
  if (!showId || !userId || filed.length === 0) return;

  const metadataKey = draftMetadataKey(DRAFT_STORAGE_KEY_PREFIX, showId, userId);
  let metadata: DraftMetadata[];
  try {
    const raw = localStorage.getItem(metadataKey);
    metadata = raw ? (JSON.parse(raw) as DraftMetadata[]) : [];
  } catch (error) {
    logger.warn('Could not read saved drafts to prune', 'registration', { showId }, asError(error));
    return;
  }
  if (!Array.isArray(metadata) || metadata.length === 0) return;

  const handledClassKeys = new Set(
    filed.map(({ dogId, classId }) => makeHandlerKey(dogId, classId))
  );
  const handledDogIds = new Set(filed.map(({ dogId }) => dogId));

  const { remainingMetadata } = pruneStoredDrafts({
    metadata,
    keyFor: id => draftKey(DRAFT_STORAGE_KEY_PREFIX, showId, userId, id),
    showId,
    userId,
    handledClassKeys,
    handledDogIds,
    onError: (id, error) =>
      logger.warn(
        'Could not prune saved draft after checkout',
        'registration',
        { id },
        asError(error)
      ),
  });

  try {
    if (remainingMetadata.length > 0) {
      remainingMetadata.sort((a, b) => b.timestamp - a.timestamp);
      localStorage.setItem(metadataKey, JSON.stringify(remainingMetadata));
      return;
    }
    localStorage.removeItem(metadataKey);
  } catch (error) {
    logger.warn(
      'Could not rewrite saved drafts after checkout',
      'registration',
      { showId },
      asError(error)
    );
    return;
  }
  // Nothing left worth returning to: retire the same-tab marker too, so a
  // later visit to this show in this tab starts clean instead of hunting for
  // a draft that is gone.
  clearWizardSession(showId, userId);
}
