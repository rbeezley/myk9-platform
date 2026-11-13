/**
 * useEntryStatusAccess: binds the status-access predicate (entryStatusAccess.ts) to this viewer,
 * for the single-class and combined entry lists alike (MYK9-1807).
 */
import { useCallback, useMemo } from 'react';
import type { Entry, EntryListStatusAccess } from '@myk9/ringside';
import { maySetStatus, statusControlFor, type StatusViewer } from './entryStatusAccess';

interface Input {
  /** The resolved ringside role (the passcode grant wins over the account role). */
  role: string | null;
  ownEntryIds: ReadonlySet<string>;
  /** The class's self check-in setting; an unknown class reads as on, like the card did. */
  selfCheckinEnabled: boolean;
}

export interface EntryStatusAccessBinding {
  statusAccess: EntryListStatusAccess;
  /** True when this viewer's write of `status` on `entry` would be accepted. */
  maySetEntryStatus: (entry: Entry, status: string) => boolean;
}

export function useEntryStatusAccess({
  role,
  ownEntryIds,
  selfCheckinEnabled,
}: Input): EntryStatusAccessBinding {
  // Staff are the three roles with ring authority; every other viewer (exhibitor, no role)
  // writes through self check-in and is held to their own dogs.
  const viewer: StatusViewer =
    role === 'admin' || role === 'judge' || role === 'steward' ? 'staff' : 'exhibitor';

  const inputFor = useCallback(
    (entry: Entry) => ({
      viewer,
      ownsEntry: ownEntryIds.has(entry.id),
      selfCheckinEnabled,
      notRunning: entry.notRunningByEntryStatus === true,
    }),
    [viewer, ownEntryIds, selfCheckinEnabled]
  );

  const statusAccess = useMemo<EntryListStatusAccess>(
    () => ({
      controlFor: entry => statusControlFor(inputFor(entry)),
      selfCheckinOnly: viewer === 'exhibitor',
    }),
    [inputFor, viewer]
  );
  const maySetEntryStatus = useCallback(
    (entry: Entry, status: string) => maySetStatus({ ...inputFor(entry), status }),
    [inputFor]
  );
  return { statusAccess, maySetEntryStatus };
}
