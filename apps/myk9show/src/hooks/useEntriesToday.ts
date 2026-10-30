/**
 * The viewer's own entries in shows happening today, for Home's "Your entries today" card.
 *
 * Reads the entries, dogs, classes and shows replicas only (no network), so it works offline.
 * "Today" is `showsPaneGroupFor`, the Shows list's bucketing on the show's own calendar day.
 */

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntriesPersonId } from '@/hooks/useEntriesPersonId';
import { isAccountSession } from '@/hooks/guestServerRead';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import { REGROUP_INTERVAL_MS, showsPaneGroupFor } from '@/components/shows/browse/showsPaneGroups';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { readOwnReplicaEntryLabels } from '@/services/database/entries/ownReplicaEntries';
import { selectEntriesToday, type EntryTodayLine } from '@/features/own-entries/entriesToday';

const NO_LINES: EntryTodayLine[] = [];

export function useEntriesToday(): { lines: EntryTodayLine[]; showNames: Map<string, string> } {
  const { user } = useAuthContext();
  const personId = useEntriesPersonId();
  const queryClient = useQueryClient();
  const rawShows = useShowStore(s => s.shows);
  const trials = useTrialStore(s => s.trials);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REGROUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const queryKey = ['own-entries', 'replica-labels', personId];
  const { data: labels } = useQuery({
    queryKey,
    queryFn: () => readOwnReplicaEntryLabels(personId as string),
    enabled: !!personId && isAccountSession(user),
    staleTime: 30_000,
    retry: false,
    placeholderData: () => undefined,
    // A replica read, so it must run offline; the default 'online' mode would park it.
    networkMode: 'always' as const,
  });

  useEffect(() => {
    if (!personId) return;
    return replicatedEntriesTable.subscribe(
      () => void queryClient.invalidateQueries({ queryKey: ['own-entries', 'replica-labels'] }),
      { emitCurrent: false }
    );
  }, [personId, queryClient]);

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
