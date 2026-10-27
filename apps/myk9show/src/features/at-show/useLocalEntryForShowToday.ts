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
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { useEntriesReplicaInvalidation } from '@/hooks/queries/useEntriesReplicaInvalidation';
import { hasLocalEntryForShowToday } from './useLocalEntryForShowToday.helpers';

const LOCAL_ENTRY_TODAY_KEY = ['at-show', 'local-entry-today'] as const;

// The five replicas the answer derives from. Their own change notices drive
// re-evaluation, so every fill path (direct per-show syncs, optimistic local
// writes, discard-reverts) is covered, not only the provider's sync pass.
const SOURCES = [
  replicatedShowsTable,
  replicatedTrialsTable,
  replicatedEntriesTable,
  replicatedDogsTable,
  replicatedClassesTable,
] as const;
const NO_SOURCES = [] as const;
const COALESCE_MS = 250;

export interface LocalEntryForShowToday {
  hasLocalEntryToday: boolean;
  isLoading: boolean;
}

// A failed read rejects rather than answering false: the hook re-reads on
// every replica change notice, and a transient IndexedDB failure mid-sync must
// not turn a settled `true` into `false` and drop an offline exhibitor out of
// ringside. React Query keeps the last answer when a refetch errors; a first
// read that errors leaves no data, which the hook reports as false.
async function readLocalEntryToday(personId: string, showId: string): Promise<boolean> {
  const [show, trials, entries, dogs] = await Promise.all([
    replicatedShowsTable.getShowById(showId),
    replicatedTrialsTable.getTrialsByShow(showId),
    replicatedEntriesTable.getEntriesByShow(showId),
    replicatedDogsTable.getAllDogs(),
  ]);
  // Entry trials missing from the live list are either soft-deleted or not on
  // the device; `get` returns tombstones, so only a held, deleted row excludes.
  const liveTrialIds = new Set(trials.map(trial => trial.id));
  const otherTrialIds = [
    ...new Set(entries.flatMap(entry => (entry.trialId ? [entry.trialId] : []))),
  ].filter(id => !liveTrialIds.has(id));
  const deletedTrials = (
    await Promise.all(otherTrialIds.map(id => replicatedTrialsTable.get(id)))
  ).filter((row): row is NonNullable<typeof row> => row !== null);
  // The RPC drops entries in a soft-deleted class; read each class the
  // entries name so their deletion state reaches the helper.
  const classIds = [...new Set(entries.flatMap(entry => (entry.classId ? [entry.classId] : [])))];
  const classes = (
    await Promise.all(classIds.map(id => replicatedClassesTable.getClassById(id)))
  ).filter((row): row is NonNullable<typeof row> => row !== null);
  return hasLocalEntryForShowToday({
    personId,
    showId,
    now: new Date(),
    trials,
    show,
    entries,
    dogs,
    classes,
    deletedTrials,
  });
}

export function useLocalEntryForShowToday(
  personId: string | null,
  showId: string | undefined
): LocalEntryForShowToday {
  const enabled = Boolean(personId && showId);
  const queryKey = [...LOCAL_ENTRY_TODAY_KEY, personId, showId];
  // Judges, stewards and passcode holders have no person here: listen to nothing.
  useEntriesReplicaInvalidation([queryKey], COALESCE_MS, enabled ? SOURCES : NO_SOURCES);
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => readLocalEntryToday(personId as string, showId as string),
    enabled,
    networkMode: 'always',
    // A refetch that fails keeps the last answer; do not hammer IndexedDB.
    retry: false,
  });
  return { hasLocalEntryToday: enabled && data === true, isLoading: enabled && isLoading };
}
