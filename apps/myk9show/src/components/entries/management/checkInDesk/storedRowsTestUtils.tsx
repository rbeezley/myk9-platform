import { useState } from 'react';
import { vi } from 'vitest';
import { useManagementRefreshAfterWrite } from '@/hooks/storedManagementEntries';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { CheckInDesk } from './CheckInDesk';

/**
 * The Entry Management page's side of a desk write, with the real read-back: its list takes the
 * stored rows from the replica, then its re-read (`reRead`) runs, whatever that re-read does.
 */
export function StoredRowsDesk({
  initial,
  reRead,
}: {
  initial: EntryManagementEntry[];
  reRead: () => Promise<void>;
}) {
  const [entries, setEntries] = useState(initial);
  const refresh = useManagementRefreshAfterWrite(setEntries, reRead);
  return (
    <CheckInDesk
      showId="show-1"
      entries={entries}
      loading={false}
      unknown={false}
      onRetry={vi.fn()}
      onRefreshEntries={refresh}
      currentDate={new Date('2026-07-08T16:00:00.000Z')}
    />
  );
}
