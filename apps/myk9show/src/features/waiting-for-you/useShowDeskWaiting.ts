import { useMemo } from 'react';
import { useRegistrationNeededEntries } from '@/hooks/useRegistrationNeededEntries';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { useWaitlistWaiting } from './useWaitlistWaiting';
import type { ShowDeskWaitingInput } from '@/features/show-map/showDeskWaitingSignals';

/**
 * Everything Show Desk's "waiting for you" pills read, each from its one calculation. A field is
 * `undefined` (or `null` for the waitlist) while it is not known, and the pill is then left out
 * rather than shown as a zero.
 */
export function useShowDeskWaiting(input: {
  showId: string;
  entries: ReadonlyMap<string, EntryManagementEntry> | undefined;
  /** The viewer manages the show; otherwise nothing is read. */
  enabled: boolean;
}): ShowDeskWaitingInput {
  const { showId, entries, enabled } = input;
  const list = useMemo(() => (entries ? [...entries.values()] : []), [entries]);
  const held = useRegistrationNeededEntries(showId, list);
  const waitlist = useWaitlistWaiting(showId, enabled);
  return { heldEntries: entries ? held.count : undefined, waitlist };
}
