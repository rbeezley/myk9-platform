/**
 * useEntryStatusAccess: binds the status-access predicate (entryStatusAccess.ts) to this viewer,
 * for the single-class and combined entry lists alike (MYK9-1807).
 */
import { useCallback, useMemo } from 'react';
import { useIsOnline } from '@/hooks/useNetworkStatus';
import type { Entry, EntryListStatusAccess } from '@myk9/ringside';
import { useMyAtShowEntries } from './useMyAtShowEntries';
import { statusControlFor, statusRefusalMessage, viewerForRole } from './entryStatusAccess';

interface Input {
  /** The resolved ringside role (the passcode grant wins over the account role). */
  role: string | null;
  showId: string | undefined;
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
  /** One plain line for an exhibitor whose own dogs cannot be told apart yet, else null. */
  ownershipNotice: string | null;
  /** The signed-in account's own entries (empty while ownership is unknown). */
  ownEntryIds: ReadonlySet<string>;
}

export const OWNERSHIP_CHECKING_NOTICE =
  'We are still checking which dogs are yours. Self check-in opens once that finishes.';
export const OWNERSHIP_OFFLINE_NOTICE = 'Connect to the internet to check in your dogs.';

export function useEntryStatusAccess({
  role,
  showId,
  selfCheckinFor,
}: Input): EntryStatusAccessBinding {
  const { ownEntryIds, isUnknown, isLoading } = useMyAtShowEntries(showId);
  const ownershipUnknown = isUnknown || isLoading;
  const viewer = viewerForRole(role);
  const isOnline = useIsOnline();

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
  const ownershipNotice =
    viewer === 'exhibitor' && ownershipUnknown
      ? isOnline
        ? OWNERSHIP_CHECKING_NOTICE
        : OWNERSHIP_OFFLINE_NOTICE
      : null;
  return { statusAccess, statusRefusalFor, ownershipNotice, ownEntryIds };
}
