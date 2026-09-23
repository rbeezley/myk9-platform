import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { loadHandlerPeople, type HandlerPersonRow } from './handlerHydration';
import { projectEntryHandlerIdentity, type ProjectedEntryHandler } from './entryHandlerProjection';

export const HANDLER_PERSON_SELECT = `
      handler_person:handler_id (
        id,
        first_name,
        last_name
      )`;

/** Resolve owner IDs while the read still has the typed replicated dog row. */
export function withReplicatedDogOwner(
  entry: ReplicatedEntry,
  dogsMap: ReadonlyMap<string, ReplicatedDog>
): ReplicatedEntry {
  const ownerId = entry.dogOwnerId ?? (entry.dogId ? dogsMap.get(entry.dogId)?.ownerId : undefined);
  return ownerId === entry.dogOwnerId ? entry : { ...entry, dogOwnerId: ownerId };
}

/** Collect only the IDs needed by the canonical people hydrator. */
export function collectHandlerIdentityIds(entries: readonly ReplicatedEntry[]): string[] {
  return [
    ...new Set(
      entries.flatMap(entry =>
        [entry.handlerId, entry.dogOwnerId].filter((id): id is string => Boolean(id?.trim()))
      )
    ),
  ];
}

/** Normalize one person-shaped row before constructing a canonical people map. */
export function normalizeHandlerPerson(value: unknown): HandlerPersonRow | null {
  const person = recordFromUnknown(value);
  if (typeof person?.id !== 'string') return null;
  return {
    id: person.id,
    first_name: typeof person.first_name === 'string' ? person.first_name : null,
    last_name: typeof person.last_name === 'string' ? person.last_name : null,
  };
}

/** Build the ID-keyed canonical map from any authoritative people snapshot. */
export function handlerPeopleMapFromRows(
  rows: Iterable<{ id: string; first_name: string | null; last_name: string | null }>
): Map<string, HandlerPersonRow> {
  return new Map(
    [...rows].map(person => [
      person.id,
      {
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
      },
    ])
  );
}

/** Map replicated rows and project identity after owner IDs are attached. */
export async function mapReplicatedEntriesWithHandlerIdentity(
  entries: readonly ReplicatedEntry[],
  dogsMap: ReadonlyMap<string, ReplicatedDog>,
  mapEntry: (entry: ReplicatedEntry) => Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const entriesWithOwners = entries.map(entry => withReplicatedDogOwner(entry, dogsMap));
  const people = await loadHandlerPeople(collectHandlerIdentityIds(entriesWithOwners));
  return entriesWithOwners.map(entry => ({
    ...mapEntry(entry),
    handler_identity: projectEntryHandlerIdentity(entry, people),
  }));
}

/** Adapt a joined PostgREST row to the same canonical projection as replica rows. */
export function projectPostgrestEntryHandlerIdentity(
  row: Record<string, unknown>
): ProjectedEntryHandler {
  const handlerPerson = normalizeHandlerPerson(row.handler_person);
  const dog = recordFromUnknown(row.dog);
  const ownerPerson = normalizeHandlerPerson(dog?.owner);
  const people = handlerPeopleMapFromRows(
    [handlerPerson, ownerPerson].filter((person): person is HandlerPersonRow => person !== null)
  );
  const entry: ReplicatedEntry = {
    id: String(row.id),
    handlerId: typeof row.handler_id === 'string' ? row.handler_id : undefined,
    handler: typeof row.handler === 'string' ? row.handler : undefined,
    handlerName:
      typeof row.handlerName === 'string'
        ? row.handlerName
        : typeof row.handler_name === 'string'
          ? row.handler_name
          : undefined,
    dogOwnerId: ownerPerson?.id,
  };
  return projectEntryHandlerIdentity(entry, people);
}

export function attachPostgrestHandlerIdentity<T extends Record<string, unknown>>(
  rows: readonly T[]
): T[] {
  return rows.map(row => ({
    ...row,
    handler_identity: projectPostgrestEntryHandlerIdentity(row),
  }));
}

function recordFromUnknown(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return value as Record<string, unknown>;
}
