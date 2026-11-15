import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The unsent scores in a judge's words (MYK9-2011): "1 score not sent yet", with any other
 * changes riding along. Null when no score is waiting or refused.
 */
export function unsentScoresPhrase(scoreCount: number, otherChangeCount: number): string | null {
  if (!(scoreCount > 0)) return null;
  const scores = plural(scoreCount, 'score', 'scores');
  const others =
    otherChangeCount > 0 ? ` and ${plural(otherChangeCount, 'other change', 'other changes')}` : '';
  return `${scores}${others} not sent yet`;
}

/**
 * Whether this device's show changes are saved, in calm, truthful words. Moved from the deleted
 * Show Day header to the show home (MYK9-957); folded into the one device line in the header
 * (`OfflineReadyBadge`'s `note`, MYK9-1282) instead of being a second status chip.
 *
 * MYK9-2011: counts every change not on the server, waiting or refused, and counts scores as
 * scores, so one dog scored reads "1 score not sent yet" and "All changes saved" shows only at
 * zero. `unsentScoreCount` lets a caller make the count open the Scores not sent list.
 */
export function useSyncNote(): {
  label: string;
  needsAttention: boolean;
  unsentScoreCount: number;
} {
  const sync = useGlobalSyncStatus();
  const needsAttention =
    sync.status === 'error' || sync.status === 'conflict' || sync.refusedCount > 0;
  const scores = unsentScoresPhrase(sync.unsentScoreCount, sync.otherChangeCount);
  const changes =
    sync.otherChangeCount > 0
      ? `${plural(sync.otherChangeCount, 'change', 'changes')} saved on this device`
      : null;
  const label =
    sync.status === 'offline'
      ? `Offline · ${scores ?? changes ?? 'scores saved on this device'}`
      : (scores ??
        (needsAttention ? 'Some changes need attention' : (changes ?? 'All changes saved')));
  return { label, needsAttention, unsentScoreCount: sync.unsentScoreCount };
}
