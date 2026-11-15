/**
 * When the server refuses a score, one notice says so and opens "Scores not sent" (MYK9-2011).
 *
 * It replaces the per-score refusal toasts: those named no dog, showed the server's raw text,
 * and a fourth dismissed the first. Every refused score now lives in the list; this notice only
 * points there. It has one fixed id, so more refusals update it rather than stack, and it names
 * the dog when there is one. Mounted once, inside the router, beside the app's toaster.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { SyncFailedEventDetail } from '@/providers/replicationSyncFormatters';
import { replicatedEntriesTable } from '@/services/replication';
import { logger } from '@/utils/logger';
import { isRingsideScoreMutation, scoresNotSentPath } from './scoresNotSentModel';
import { readUnsentScoreRows, readUnsentScores, UNKNOWN_DOG_LABEL } from './useUnsentScores';

export const SCORES_NOT_SENT_TOAST_ID = 'scores-not-sent';

/** The notice's sentence: the dog when one score was refused, otherwise how many. */
export function scoresNotSentNoticeText(refusedCount: number, dogLabel?: string): string {
  if (refusedCount === 1 && dogLabel) return `The score for ${dogLabel} could not be sent.`;
  return `${refusedCount} ${refusedCount === 1 ? 'score' : 'scores'} could not be sent.`;
}

async function announce(navigate: (to: string) => void): Promise<void> {
  const refused = (await readUnsentScores()).filter(score => score.state === 'refused');
  const first = refused[0];
  if (!first) return;
  const showId = first.showId ?? (await replicatedEntriesTable.getEntryById(first.entryId))?.showId;
  const dogLabel =
    refused.length === 1 && showId
      ? (await readUnsentScoreRows(showId)).find(row => row.entryId === first.entryId)?.dogLabel
      : undefined;
  const text = scoresNotSentNoticeText(
    refused.length,
    dogLabel === UNKNOWN_DOG_LABEL ? undefined : dogLabel
  );
  toast.error(text, {
    id: SCORES_NOT_SENT_TOAST_ID,
    // INTENT: stays until the judge looks. The scores are safe on this device either way.
    duration: Infinity,
    ...(showId && {
      action: {
        label: 'See scores not sent',
        onClick: () => navigate(scoresNotSentPath(showId)),
      },
    }),
  });
}

export function ScoresNotSentNotice() {
  const navigate = useNavigate();
  useEffect(() => {
    const onSyncFailed = (event: Event) => {
      const detail = (event as CustomEvent<SyncFailedEventDetail>).detail;
      if (!detail?.mutations?.some(isRingsideScoreMutation)) return;
      void announce(to => navigate(to)).catch(error =>
        logger.warn('[scores-not-sent] notice failed', 'replication', { error: String(error) })
      );
    };
    window.addEventListener('replication:sync-failed', onSyncFailed);
    return () => window.removeEventListener('replication:sync-failed', onSyncFailed);
  }, [navigate]);
  return null;
}

/**
 * The sync-failure detail without its ringside scores, which this notice and the list own; null
 * when nothing else is left for the generic failure toast.
 */
export function withoutRingsideScoreFailures(
  detail: SyncFailedEventDetail
): SyncFailedEventDetail | null {
  const rest = detail.mutations.filter(mutation => !isRingsideScoreMutation(mutation));
  if (rest.length === detail.mutations.length) return detail;
  if (rest.length === 0) return null;
  return { ...detail, count: rest.length, mutations: rest };
}
