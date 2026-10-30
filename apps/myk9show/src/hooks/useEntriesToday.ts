/**
 * The viewer's own entries in shows happening today, for Home's "Your entries today" card.
 *
 * Reads the account-level `getUserEntries` (server first, the replicas as its offline fallback),
 * so a new device or a show never opened here still shows the entry. It is the same read My
 * Shows makes, so it adds no new network path. "Today" is `showsPaneGroupFor`, the Shows list's
 * bucketing on the show's own calendar day. There is no replica subscription here: the
 * fallback only runs offline, and the query refetches on staleness.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { isAccountSession } from '@/hooks/guestServerRead';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import { REGROUP_INTERVAL_MS, showsPaneGroupFor } from '@/components/shows/browse/showsPaneGroups';
import { getUserEntries } from '@/services/database/entries';
import {
  labelsFromUserEntryRows,
  selectEntriesToday,
  type EntryTodayLine,
  type UserEntryRow,
} from '@/features/own-entries/entriesToday';

const NO_LINES: EntryTodayLine[] = [];

export function useEntriesToday(): { lines: EntryTodayLine[]; showNames: Map<string, string> } {
  const { user } = useAuthContext();
  const personId = useEntriesPersonId();
  const rawShows = useShowStore(s => s.shows);
  const trials = useTrialStore(s => s.trials);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REGROUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const { data: labels } = useQuery({
    queryKey: ['own-entries', 'today-rows', personId],
    queryFn: async () => {
      const { data: rows, error } = await getUserEntries(personId as string);
      if (error) throw error;
      return labelsFromUserEntryRows((rows ?? []) as unknown as UserEntryRow[]);
    },
    enabled: !!personId && isAccountSession(user),
    staleTime: 60_000,
    retry: 1,
    placeholderData: () => undefined,
    // `getUserEntries` carries its own offline fallback; the default 'online' mode would park it.
    networkMode: 'always' as const,
  });

  return useMemo(() => {
    const shows = withEntryWindowTimeZones(rawShows, trials);
    const todayShows = shows.filter(show => showsPaneGroupFor(show, now) === 'today');
    const todayIds = new Set(todayShows.map(show => show.id));
    return {
      lines: labels ? selectEntriesToday(labels, todayIds) : NO_LINES,
      showNames: new Map(todayShows.map(show => [show.id, show.name])),
    };
  }, [labels, rawShows, trials, now]);
}
