import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';

/**
 * Whether this device's show changes are saved, in calm, truthful words. Moved from the deleted
 * Show Day header to the show home (MYK9-957); folded into the one device line in the header
 * (`OfflineReadyBadge`'s `note`, MYK9-1282) instead of being a second status chip.
 */
export function useSyncNote(): { label: string; needsAttention: boolean } {
  const sync = useGlobalSyncStatus();
  const needsAttention = sync.status === 'error' || sync.status === 'conflict';
  const label =
    sync.status === 'offline'
      ? 'Changes saved on this device, will sync when online'
      : needsAttention
        ? 'Sync needs attention'
        : sync.status === 'pending'
          ? `${sync.queueSize} ${sync.queueSize === 1 ? 'change' : 'changes'} saved on this device`
          : 'All changes saved';
  return { label, needsAttention };
}
