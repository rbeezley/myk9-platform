import { useMemo } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { useOwnEntryClaims } from './useOwnEntryClaims';
import { useShowRingRows } from './useShowRingRows';
import { detectMyRingConflicts } from './ringConflicts';

const NO_ENTRIES: readonly { id: string; classId?: string | undefined }[] = [];
const EMPTY_CONFLICTS: ReadonlyMap<string, string> = new Map();

/**
 * Show-wide ring-conflict labels for the signed-in exhibitor's entries.
 * Replication-backed (offline-safe): one entries-by-show scan + the show's
 * classes, re-read when the replicated tables change. Returns entryId → label
 * for the entry-list conflict chip; empty map when nothing collides.
 */
export function useMyRingConflicts(
  showId: string | undefined,
  ownEntryIds: ReadonlySet<string>
): ReadonlyMap<string, string> {
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);
  const query = useShowRingRows(showId, !!showId && ownEntryIds.size > 0);
  const claims = useOwnEntryClaims(showId, ownEntryIds, query.data?.entries ?? NO_ENTRIES);

  return useMemo(() => {
    // A failed read leaves no badges, not a claim of no conflicts: the entry
    // list these decorate reads the same tables and shows its own error (MYK9-774).
    if (!query.data || ownEntryIds.size === 0) return EMPTY_CONFLICTS;
    return detectMyRingConflicts({
      entries: query.data.entries,
      classes: query.data.classes,
      ownEntryIds,
      leadDogs,
      claims,
      showUsesDeviceScoring: query.data.usesDeviceScoring,
    });
  }, [query.data, ownEntryIds, leadDogs, claims]);
}
