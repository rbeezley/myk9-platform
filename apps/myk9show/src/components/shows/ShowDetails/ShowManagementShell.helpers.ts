import type { GeneratedPremium } from '@/types/premium-types';
import type { Show } from '@/types/show-types';
import type { ShowInput } from '@/store/showStore';
import type { ShowJudgeAssignment } from '@/types/judge-types';

/** Publish saves are online-only by design (P2-D): the DB gate
 * (enforce_show_publish_gate) needs a live round trip, and unlike an
 * ordinary edit there is nothing useful to queue for later -- a client that
 * queued the publish offline would show "Show changes saved" while the
 * actual publish state is unknown until the device reconnects. */
export const PUBLISH_REQUIRES_ONLINE_MESSAGE = 'You need to be online to publish a show.';

/** The edit-panel save payload: form fields mapped onto ShowInput, plus the
 * publish-experience extras the Premium tab can attach to the same save. */
export type ShowSaveData = Partial<ShowInput> & {
  publishExperience?: boolean;
  generatedPremium?: GeneratedPremium;
  inkSaver?: boolean;
};

/** Opaque to saveShowEdit -- whatever applyServerRow needs to reconcile the
 * local replicated store with the row updateShowDirect just confirmed. */
export type ShowDirectUpdateResult = {
  /** Mapped for React Query caches (showQueryKeys.detail/lists). */
  show: Show;
  /** Handed back to applyServerRow untouched. */
  replicationPayload: unknown;
};

export interface ShowSaveCollaborators {
  /** Best-effort online check (e.g. useOnlineStatus / navigator.onLine). */
  isOnline: () => boolean;
  /** ONE awaited direct Supabase update carrying the FULL save payload --
   * every edited field, including clubId and status, never just {status}
   * (MYK9-579 P1-B: the DB gate evaluates the row AS WRITTEN, so a save that
   * assigns a club and publishes in the same edit must send the new
   * clubId). Must reject with the DB's own error object (`.code` intact) on
   * a gate refusal -- saveShowEdit does not remap it; ShowEditPanel's own
   * catch (isPublishGateDbError / publishGateDbErrorMessage) is the one
   * place that turns it into friendly copy (P3-H). */
  updateShowDirect: (id: string, showData: ShowSaveData) => Promise<ShowDirectUpdateResult>;
  /** Apply the row updateShowDirect just confirmed to the local replicated
   * store through the "server confirmed via a side channel" path
   * (ReplicatedTable.replaceFromRemote) -- never queueMutation. Queuing a
   * second write for the same row here is what caused the P1-A OCC race:
   * the direct write already bumped shows.version, so a queued full-row
   * UPDATE built from the pre-save serverVersion would carry a stale OCC
   * precondition and get silently rejected while the panel had already
   * toasted success. */
  applyServerRow: (
    id: string,
    serverResult: ShowDirectUpdateResult['replicationPayload']
  ) => Promise<void>;
  /** The queued/offline-durable replication path -- unchanged, and used
   * ONLY for a save that is not a draft->published transition. */
  updateShowLocally: (id: string, showData: ShowSaveData) => Promise<Show | null>;
  persistJudges: (id: string, judges: ShowJudgeAssignment[]) => Promise<void>;
  /** No-op when the save has no publish-experience content to publish. */
  maybePublishExperience: (id: string, showData: ShowSaveData) => Promise<void>;
  /** Push a freshly-saved Show into whatever caches the caller keeps (React
   * Query detail/list entries). */
  onShowSaved: (id: string, show: Show) => void;
  notifySuccess: (message: string) => void;
}

/**
 * MYK9-579 restructure (round 3 review): a draft->published save no longer
 * races a direct status write against a queued replication write for the
 * same row (P1-A), and the direct write now carries the save's FULL
 * payload so "assign a club and publish" in one edit is evaluated against
 * the NEW club, not OLD.club_id (P1-B).
 *
 * For a transition INTO 'published':
 *   1. Refuse up front if offline, before any write (P2-D) -- see
 *      PUBLISH_REQUIRES_ONLINE_MESSAGE.
 *   2. Run every other side effect FIRST -- judge assignments, then any
 *      publish-experience content -- so a mid-save failure never leaves the
 *      show marked published with half-applied edits (P2-C).
 *   3. Perform the single awaited direct write LAST. A DB refusal
 *      (enforce_show_publish_gate, SQLSTATE MK003) propagates untouched
 *      (see updateShowDirect's contract above).
 *   4. Apply the server's confirmed row to the replicated store directly.
 *      Nothing is queued through updateShowLocally for this save.
 *
 * Every other save -- a draft staying a draft, or an already-published
 * show's unrelated edit -- is unchanged: queued through updateShowLocally.
 */
export async function saveShowEdit(
  showId: string,
  currentStatus: string | undefined,
  showData: ShowSaveData,
  collaborators: ShowSaveCollaborators
): Promise<void> {
  const {
    isOnline,
    updateShowDirect,
    applyServerRow,
    updateShowLocally,
    persistJudges,
    maybePublishExperience,
    onShowSaved,
    notifySuccess,
  } = collaborators;

  const newlyPublishing = showData.status === 'published' && currentStatus !== 'published';

  if (newlyPublishing) {
    if (!isOnline()) {
      throw new Error(PUBLISH_REQUIRES_ONLINE_MESSAGE);
    }

    await persistJudges(showId, showData.assignedJudges ?? []);
    await maybePublishExperience(showId, showData);

    const result = await updateShowDirect(showId, showData);
    await applyServerRow(showId, result.replicationPayload);
    onShowSaved(showId, result.show);
  } else {
    const localShow = await updateShowLocally(showId, showData);
    if (!localShow) {
      throw new Error('Show was not available in the local store.');
    }
    await persistJudges(showId, showData.assignedJudges ?? []);
    onShowSaved(showId, localShow);
    await maybePublishExperience(showId, showData);
  }

  notifySuccess('Show changes saved');
}
