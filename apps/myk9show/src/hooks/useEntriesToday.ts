/**
 * The viewer's own entries in shows happening today, for Home's "Your entries today" card.
 *
 * It owns no read. The rows are `useMyEntriesData`'s, the same source My Shows renders, so the
 * two surfaces cannot disagree and identity, offline fallback and the server-first read are
 * decided once. "Today" is `showsPaneGroupFor`, the Shows list's bucketing on the show's own
 * calendar day. `useMyEntriesData` loads on mount and on request only, so this subscribes to the
 * replicas it falls back on and asks it to re-read when check-in, ring or class data changes.
 */

import { useEffect, useMemo, useState } from 'react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { withEntryWindowTimeZones } from '@/utils/entryWindowZones';
import { REGROUP_INTERVAL_MS, showsPaneGroupFor } from '@/components/shows/browse/showsPaneGroups';
import { useMyEntriesData } from '@/pages/MyEntriesPage/modules/useMyEntriesData';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import {
  labelsFromMyEntries,
  selectEntriesToday,
  type EntryTodayLine,
} from '@/features/own-entries/entriesToday';

const REFRESH_DEBOUNCE_MS = 750;

/** The card only reads; `useMyEntriesData` takes a check-in writer it never calls here. */
const CARD_NEVER_WRITES = async () => undefined;

export function useEntriesToday(): { lines: EntryTodayLine[]; showNames: Map<string, string> } {
  const { entries, refreshEntries } = useMyEntriesData({ persistCheckInStatus: CARD_NEVER_WRITES });
  const rawShows = useShowStore(s => s.shows);
  const trials = useTrialStore(s => s.trials);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REGROUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onChange = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refreshEntries(), REFRESH_DEBOUNCE_MS);
    };
    const unsubscribes = [replicatedEntriesTable, replicatedDogsTable, replicatedClassesTable].map(
      table => table.subscribe(onChange, { emitCurrent: false })
    );
    return () => {
      clearTimeout(timer);
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [refreshEntries]);

  return useMemo(() => {
    const shows = withEntryWindowTimeZones(rawShows, trials);
    const todayShows = shows.filter(show => showsPaneGroupFor(show, now) === 'today');
    const todayIds = new Set(todayShows.map(show => show.id));
    return {
      lines: selectEntriesToday(labelsFromMyEntries(entries), todayIds),
      showNames: new Map(todayShows.map(show => [show.id, show.name])),
    };
  }, [entries, rawShows, trials, now]);
}
