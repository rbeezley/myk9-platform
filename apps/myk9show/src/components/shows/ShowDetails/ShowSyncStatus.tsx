import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

/**
 * Whether this device's show changes are saved, in calm, truthful words. Moved from the deleted
 * Show Day header to the show home (MYK9-957); folded into the one device line in the header
 * (`OfflineReadyBadge`'s `note`, MYK9-1282) instead of being a second status chip.
 */
export function useSyncNote(): {
  label: string;
  needsAttention: boolean;
  /** A change is held for the person's choice (MYK9-1995): the note is a button that raises it. */
  choiceNeeded: boolean;
} {
  const sync = useGlobalSyncStatus();
  const needsAttention = sync.status === 'error' || sync.status === 'conflict';
  const choiceNeeded = sync.status === 'conflict' && sync.conflictCount > 0;
  const label = choiceNeeded
    ? `${sync.conflictCount} ${sync.conflictCount === 1 ? 'change needs' : 'changes need'} your choice`
    : sync.status === 'offline'
      ? sync.queueSize > 0
        ? `Offline · ${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
        : 'Offline · scores saved on this device'
      : needsAttention
        ? 'Some changes need attention'
        : sync.status === 'pending'
          ? `${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
          : 'All changes saved';
  return { label, needsAttention, choiceNeeded };
}
