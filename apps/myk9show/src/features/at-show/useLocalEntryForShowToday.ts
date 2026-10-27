/**
 * MYK9-1346: does this device already hold an entry of the signed-in
 * exhibitor's for this show, while the show is on today?
 *
 * The at-show gate otherwise waits on a server round trip (the
 * `get_account_today_entries` RPC) before anything draws. An exhibitor who has
 * opened this show before already has their entries in the replica, so the
 * gate can admit on that and let the server confirm in the background.
 *
 * Reads replicated tables only. Any read failure answers `false`: that is an
 * absence of knowledge, never an error state; the server path owns the error
 * copy. `networkMode: 'always'` because the read is local and must run offline.
 */
import { useQuery } from '@tanstack/react-query';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { LOCAL_ENTRY_TODAY_KEY } from './localEntryTodayKey';
import { hasLocalEntryForShowToday } from './useLocalEntryForShowToday.helpers';

export interface LocalEntryForShowToday {
  hasLocalEntryToday: boolean;
  isLoading: boolean;
}

async function readLocalEntryToday(personId: string, showId: string): Promise<boolean> {
  try {
    const [show, trials, entries, dogs] = await Promise.all([
      replicatedShowsTable.getShowById(showId),
      replicatedTrialsTable.getTrialsByShow(showId),
      replicatedEntriesTable.getEntriesByShow(showId),
      replicatedDogsTable.getAllDogs(),
    ]);
    return hasLocalEntryForShowToday({
      personId,
      showId,
      now: new Date(),
      trials,
      show,
      entries,
      dogs,
    });
  } catch {
    return false;
  }
}

export function useLocalEntryForShowToday(
  personId: string | null,
  showId: string | undefined
): LocalEntryForShowToday {
  const enabled = Boolean(personId && showId);
  const { data, isLoading } = useQuery({
    queryKey: [...LOCAL_ENTRY_TODAY_KEY, personId, showId],
    queryFn: () => readLocalEntryToday(personId as string, showId as string),
    enabled,
    networkMode: 'always',
  });
  return { hasLocalEntryToday: enabled && data === true, isLoading: enabled && isLoading };
}
