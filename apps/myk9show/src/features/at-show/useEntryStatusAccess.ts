/**
 * useEntryStatusAccess: binds the status-access predicate (entryStatusAccess.ts) to this viewer,
 * for the single-class and combined entry lists alike (MYK9-1807).
 */
import { useCallback, useMemo } from 'react';
import type { Entry, EntryListStatusAccess } from '@myk9/ringside';
import { statusControlFor, statusRefusalMessage, viewerForRole } from './entryStatusAccess';

interface Input {
  /** The resolved ringside role (the passcode grant wins over the account role). */
  role: string | null;
  ownEntryIds: ReadonlySet<string>;
  /**
   * Whether this class allows self check-in. Judged per entry (the server reads the entry's own
   * class), so a combined A and B list answers each dog from its own section. An unknown class
   * reads as on, like the card did.
   */
  selfCheckinFor: (classId: string) => boolean;
}

export interface EntryStatusAccessBinding {
  statusAccess: EntryListStatusAccess;
  /** Why this viewer's write of `status` on `entry` would be refused, or null when it may go. */
  statusRefusalFor: (entry: Entry, status: string) => string | null;
}

export function useEntryStatusAccess({
  role,
  ownEntryIds,
  selfCheckinFor,
}: Input): EntryStatusAccessBinding {
  const viewer = viewerForRole(role);

  const inputFor = useCallback(
    (entry: Entry) => ({
      viewer,
      ownsEntry: ownEntryIds.has(entry.id),
      selfCheckinEnabled: selfCheckinFor(entry.classId),
      notRunning: entry.notRunningByEntryStatus === true,
    }),
    [viewer, ownEntryIds, selfCheckinFor]
  );

  const statusAccess = useMemo<EntryListStatusAccess>(
    () => ({
      controlFor: entry => statusControlFor(inputFor(entry)),
      selfCheckinOnly: viewer === 'exhibitor',
    }),
    [inputFor, viewer]
  );
  const statusRefusalFor = useCallback(
    (entry: Entry, status: string) => statusRefusalMessage({ ...inputFor(entry), status }),
    [inputFor]
  );
  return { statusAccess, statusRefusalFor };
}
