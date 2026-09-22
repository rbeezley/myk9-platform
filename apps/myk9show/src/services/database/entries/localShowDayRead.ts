/** Local-only entry projection for show-day queues. */
import { replicatedDogsTable, replicatedEntriesTable } from '@/services/replication';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { loadCachedHandlerPeople, loadHandlerPeople } from './handlerHydration';
import { projectEntryHandlerIdentity, type ProjectedEntryHandler } from './entryHandlerProjection';
import { withReplicatedDogOwner } from './entryHandlerReadBoundary';
import { getHandlerPeopleHydrationRevision } from './handlerHydration';

export type LocalShowDayEntry = ReplicatedEntry & {
  handler_identity: ProjectedEntryHandler;
};

export interface LocalShowDayRead {
  entries: LocalShowDayEntry[];
  /** Revision observed before the async cache read; compare after query publication. */
  hydrationRevision: number;
}

function isLive(entry: ReplicatedEntry): boolean {
  return !(entry.deletedAt ?? entry.deleted_at);
}

async function projectLocalEntries(entries: ReplicatedEntry[]): Promise<LocalShowDayRead> {
  const hydrationRevision = getHandlerPeopleHydrationRevision();
  const liveEntries = entries.filter(isLive);
  const dogs = await replicatedDogsTable.getAllDogs();
  const dogsById = new Map(dogs.map(dog => [dog.id, dog]));
  const entriesWithOwners = liveEntries.map(entry => withReplicatedDogOwner(entry, dogsById));
  const personIds = [
    ...new Set(
      entriesWithOwners.flatMap(entry =>
        [entry.handlerId, entry.dogOwnerId].filter((id): id is string => Boolean(id?.trim()))
      )
    ),
  ];
  const cachedPeople = await loadCachedHandlerPeople(personIds);

  // Start authoritative refresh through the shared generation-guarded path.
  // The local read and first render do not wait on it.
  void loadHandlerPeople(personIds);

  return {
    hydrationRevision,
    entries: entriesWithOwners.map(entry => {
      const dog = entry.dogId ? dogsById.get(entry.dogId) : undefined;
      return {
        ...entry,
        dogCallName: entry.dogCallName ?? dog?.callName ?? dog?.name ?? '',
        dogBreed: entry.dogBreed ?? dog?.breed ?? '',
        handler_identity: projectEntryHandlerIdentity(entry, cachedPeople),
      };
    }),
  };
}

/** Read the locally replicated show entries and cached identity only. */
export async function getLocalShowDayEntriesByShow(showId: string): Promise<LocalShowDayRead> {
  const entries = await replicatedEntriesTable.getEntriesByShow(showId);
  return projectLocalEntries(entries);
}

/** Read the locally replicated class entries and cached identity only. */
export async function getLocalShowDayEntriesByClass(classId: string): Promise<LocalShowDayRead> {
  const entries = await replicatedEntriesTable.getEntriesByClass(classId);
  const result = await projectLocalEntries(entries);
  result.entries.sort(
    (a, b) => (a.runOrder ?? Number.MAX_SAFE_INTEGER) - (b.runOrder ?? Number.MAX_SAFE_INTEGER)
  );
  return result;
}
