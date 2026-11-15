import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { scoresNotSentLabel } from '@/features/at-show/scoresNotSent/scoresNotSentModel';

/**
 * Whether this device's show changes are saved, in calm, truthful words. Moved from the deleted
 * Show Day header to the show home (MYK9-957); folded into the one device line in the header
 * (`OfflineReadyBadge`'s `note`, MYK9-1282) instead of being a second status chip.
 */
export function useSyncNote(): {
  label: string;
  needsAttention: boolean;
  unsentScoreCount: number;
} {
  const sync = useGlobalSyncStatus();
  const needsAttention = sync.status === 'error' || sync.status === 'conflict';
  // MYK9-2011: scores come first and are counted in scores, one per dog, waiting or refused
  // ("1 score not sent yet", never "3 changes"), so this line never reads as saved while a
  // score has not reached the server.
  const scores = sync.unsentScoreCount;
  const label =
    sync.status === 'offline'
      ? scores > 0
        ? `Offline · ${scoresNotSentLabel(scores)}`
        : sync.queueSize > 0
          ? `Offline · ${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
          : 'Offline · scores saved on this device'
      : scores > 0
        ? scoresNotSentLabel(scores)
        : needsAttention
          ? 'Some changes need attention'
          : sync.status === 'pending'
            ? `${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
            : 'All changes saved';
  return { label, needsAttention, unsentScoreCount: scores };
}
