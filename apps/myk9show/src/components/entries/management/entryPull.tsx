import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { DeskPullDialogs } from './checkInDesk/DeskPullDialogs';
import type { EntriesRefresh } from './checkInDesk/entriesRefresh';
import { useDeskPull, type DeskPullRow } from './checkInDesk/useDeskPull';
import { REVERT_CANCELLED } from './useScoredRevertGuard';

/** Where an Entries-page Pull is recorded when the secretary gives no reason (MYK9-1940). */
export const ENTRIES_PULL_STARTED_AT = 'Pulled on the Entries page';

/** The class a Pull names: the entry's own class, as the desks name theirs. */
function toPullRow(entry: EntryManagementEntry): DeskPullRow {
  const pullable =
    entry.entryStatus !== EntryStatus.SCRATCHED && entry.entryStatus !== EntryStatus.MOVED;
  return {
    entryId: entry.id,
    dogName: entry.dogName,
    className: entry.classes[0]?.name ?? 'this class',
    armband: entry.armbandNumber ?? null,
    deskStatusEditable: pullable,
    deskCanUnpull: false,
  };
}

const EntryPullContext = createContext<((entry: EntryManagementEntry) => void) | null>(null);

/**
 * The Entries page's Pull is the desks' Pull (MYK9-1940): the same dialog with its refund note,
 * the same write, and the shared Undo toast. A surface under this provider hands a single-entry
 * Pull to it; with no provider (a page that has none) the status change runs as before.
 */
export function EntryPullProvider({
  entries,
  onRefreshEntries,
  children,
}: {
  entries: readonly EntryManagementEntry[];
  onRefreshEntries?: EntriesRefresh | undefined;
  children: ReactNode;
}) {
  const pull = useDeskPull(
    entryId => {
      const entry = entries.find(candidate => candidate.id === entryId);
      return entry ? toPullRow(entry) : undefined;
    },
    onRefreshEntries,
    ENTRIES_PULL_STARTED_AT
  );
  const { requestPull } = pull;
  const request = useCallback(
    (entry: EntryManagementEntry) => requestPull(toPullRow(entry)),
    [requestPull]
  );
  return (
    <EntryPullContext.Provider value={request}>
      {children}
      <DeskPullDialogs pull={pull} />
    </EntryPullContext.Provider>
  );
}

type StatusChange = (
  entryId: string,
  status: EntryStatus
) => void | boolean | Promise<boolean | void> | typeof REVERT_CANCELLED;

/**
 * `onStatusChange` with Pull handed to the page's Pull dialog. The dialog owns the write and its
 * toast, so this reports `REVERT_CANCELLED`: nothing was changed here, and the caller shows no
 * "saved on this device" or failure note for it.
 */
export function usePullAwareStatusChange(
  entry: EntryManagementEntry,
  onStatusChange: StatusChange | undefined
): StatusChange | undefined {
  const requestPull = useContext(EntryPullContext);
  if (!onStatusChange || !requestPull) return onStatusChange;
  return (entryId, status) => {
    if (status !== EntryStatus.SCRATCHED) return onStatusChange(entryId, status);
    requestPull(entry);
    return REVERT_CANCELLED;
  };
}
