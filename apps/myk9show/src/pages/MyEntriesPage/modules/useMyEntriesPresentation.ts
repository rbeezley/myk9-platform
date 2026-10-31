/**
 * The one presentation decision for "what do we know about this exhibitor's
 * entries": My Shows picks its page branch with it and the Home "Your entries
 * today" card renders from the same answer, so neither re-derives identity or
 * read state (MYK9-1524).
 *
 * @module MyEntriesPage/modules/useMyEntriesPresentation
 */

import { useMemo } from 'react';
import { getMyEntriesPresentation, type MyEntriesPresentation } from './entriesIdentityState';
import type { useMyEntriesData } from './useMyEntriesData';

type MyEntriesData = ReturnType<typeof useMyEntriesData>;

export function useMyEntriesPresentation(
  data: Pick<MyEntriesData, 'entries' | 'identityState' | 'readState' | 'isLoading'>
): MyEntriesPresentation {
  const { entries, identityState, readState, isLoading } = data;
  const entryCount = entries.length;
  return useMemo(
    () => getMyEntriesPresentation({ identityState, readState, entryCount, isLoading }),
    [identityState, readState, entryCount, isLoading]
  );
}
