import { supabase } from '../supabaseClient';
import { db } from '../connection';
import { withTimeout } from '@myk9/core';

const HANDLER_PEOPLE_TIMEOUT_MS = 3000;
const HANDLER_PEOPLE_FAST_TIMEOUT_MS = 250;
const HANDLER_PEOPLE_CIRCUIT_COOLDOWN_MS = 30_000;

let handlerHydrationCircuitOpenUntil = 0;
const personGenerations = new Map<string, number>();

function beginGeneration(ids: readonly string[]): Map<string, number> {
  return new Map(
    ids.map(id => {
      const generation = (personGenerations.get(id) ?? 0) + 1;
      personGenerations.set(id, generation);
      return [id, generation] as const;
    })
  );
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export interface HandlerPersonRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface HandlerPeopleHydrationEvent {
  /** IDs whose authoritative refresh has completed and been persisted. */
  ids: readonly string[];
  /** The authoritative snapshot for those IDs; omitted IDs were not returned. */
  people: ReadonlyMap<string, HandlerPersonRow>;
}

type HandlerPeopleHydrationListener = (event: HandlerPeopleHydrationEvent) => void;

const handlerPeopleHydrationListeners = new Set<HandlerPeopleHydrationListener>();

/** Subscribe without coupling consumers to a React Query key or cache. */
export function subscribeHandlerPeopleHydration(
  listener: HandlerPeopleHydrationListener
): () => void {
  handlerPeopleHydrationListeners.add(listener);
  return () => handlerPeopleHydrationListeners.delete(listener);
}

function emitHandlerPeopleHydration(
  ids: readonly string[],
  people: ReadonlyMap<string, HandlerPersonRow>
): void {
  if (ids.length === 0) return;
  const event: HandlerPeopleHydrationEvent = {
    ids: [...ids],
    people: new Map(
      ids
        .map(id => [id, people.get(id)] as const)
        .filter((entry): entry is readonly [string, HandlerPersonRow] => Boolean(entry[1]))
    ),
  };
  for (const listener of handlerPeopleHydrationListeners) {
    try {
      listener(event);
    } catch {
      // A consumer refresh must not make the read boundary fail.
    }
  }
}

interface CachedHandlerPerson {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

function normalizeCachedPerson(
  person: CachedHandlerPerson | null | undefined
): HandlerPersonRow | null {
  if (!person?.id) return null;
  return {
    id: person.id,
    first_name: person.first_name ?? person.firstName ?? null,
    last_name: person.last_name ?? person.lastName ?? null,
  };
}

function sameHandlerPerson(
  first: HandlerPersonRow | undefined,
  second: HandlerPersonRow | undefined
): boolean {
  if (!first || !second) return first === second;
  return (
    first.id === second.id &&
    first.first_name === second.first_name &&
    first.last_name === second.last_name
  );
}

function currentHandlerIds(
  ids: readonly string[],
  requestGeneration: ReadonlyMap<string, number>
): string[] {
  return ids.filter(id => personGenerations.get(id) === requestGeneration.get(id));
}

/** Read the local people cache before attempting an online hydration. */
export async function loadCachedHandlerPeople(
  handlerIds: readonly string[]
): Promise<Map<string, HandlerPersonRow>> {
  const ids = [...new Set(handlerIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  try {
    const cached = await db.instance.people.bulkGet(ids);
    return new Map(
      cached
        .map(person => normalizeCachedPerson(person as CachedHandlerPerson | undefined))
        .filter((person): person is HandlerPersonRow => Boolean(person))
        .map(person => [person.id, person])
    );
  } catch {
    return new Map();
  }
}

async function persistAuthoritativeHandlerPeople(
  ids: readonly string[],
  people: ReadonlyMap<string, HandlerPersonRow>,
  requestGeneration: ReadonlyMap<string, number>,
  cached: ReadonlyMap<string, HandlerPersonRow>
): Promise<readonly string[] | null> {
  try {
    const isCurrent = (id: string) => personGenerations.get(id) === requestGeneration.get(id);
    const changedIds = ids.filter(
      id => isCurrent(id) && !sameHandlerPerson(cached.get(id), people.get(id))
    );
    const changedPeople = [...people.values()].filter(
      person => isCurrent(person.id) && changedIds.includes(person.id)
    );
    const peopleToPersist = changedPeople.map(person => ({
      id: person.id,
      firstName: person.first_name ?? '',
      lastName: person.last_name ?? '',
    }));
    if (peopleToPersist.length > 0) await db.instance.people.bulkPut(peopleToPersist);
    const missingIds = changedIds.filter(id => isCurrent(id) && !people.has(id));
    if (missingIds.length > 0) await db.instance.people.bulkDelete(missingIds);
    return changedIds;
  } catch {
    // A cache write is an optimization; the current caller already has the
    // authoritative projection and the next read can try again.
    return null;
  }
}

/** Recheck generations after persistence so superseded requests cannot publish. */
function emitCurrentHandlerPeople(
  ids: readonly string[],
  people: ReadonlyMap<string, HandlerPersonRow>,
  requestGeneration: ReadonlyMap<string, number>
): void {
  emitHandlerPeopleHydration(currentHandlerIds(ids, requestGeneration), people);
}

export async function loadHandlerPeople(
  handlerIds: readonly string[]
): Promise<Map<string, HandlerPersonRow>> {
  const ids = [...new Set(handlerIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const cached = await loadCachedHandlerPeople(ids);

  // IndexedDB is the authoritative offline source for this ancillary join.
  // Do not make every replicated entry read wait for the online timeout when
  // the browser has already told us there is no network.
  if (isOffline()) return cached;
  if (Date.now() < handlerHydrationCircuitOpenUntil) return cached;

  const requestGeneration = beginGeneration(ids);
  const refresh = Promise.resolve()
    .then(() =>
      withTimeout(
        supabase.from('people').select('id, first_name, last_name').in('id', ids),
        HANDLER_PEOPLE_TIMEOUT_MS,
        'entry handler identity hydration'
      )
    )
    .then(({ data, error }) => {
      if (error || !data) return null;
      // A successful response is authoritative. If an id is omitted because the
      // person was deleted or is no longer visible, do not resurrect its stale
      // cached name into paperwork.
      return new Map((data as HandlerPersonRow[]).map(person => [person.id, person] as const));
    });

  const fastResult = await Promise.race([
    refresh
      .then(result => ({ kind: 'fresh' as const, result }))
      .catch(() => ({ kind: 'failed' as const })),
    new Promise<{ kind: 'deferred' }>(resolve =>
      setTimeout(() => resolve({ kind: 'deferred' }), HANDLER_PEOPLE_FAST_TIMEOUT_MS)
    ),
  ]);
  if (fastResult.kind === 'fresh' && fastResult.result) {
    handlerHydrationCircuitOpenUntil = 0;
    const changedIds = await persistAuthoritativeHandlerPeople(
      ids,
      fastResult.result,
      requestGeneration,
      cached
    );
    if (changedIds) emitCurrentHandlerPeople(changedIds, fastResult.result, requestGeneration);
    return fastResult.result;
  }
  if (fastResult.kind === 'failed') {
    handlerHydrationCircuitOpenUntil = Date.now() + HANDLER_PEOPLE_CIRCUIT_COOLDOWN_MS;
    return cached;
  }

  // Return the safe local projection promptly, then persist the authoritative
  // response when it arrives.
  void refresh
    .then(async result => {
      if (!result) {
        handlerHydrationCircuitOpenUntil = Date.now() + HANDLER_PEOPLE_CIRCUIT_COOLDOWN_MS;
        return;
      }
      handlerHydrationCircuitOpenUntil = 0;
      const changedIds = await persistAuthoritativeHandlerPeople(
        ids,
        result,
        requestGeneration,
        cached
      );
      if (changedIds) emitCurrentHandlerPeople(changedIds, result, requestGeneration);
    })
    .catch(() => {
      handlerHydrationCircuitOpenUntil = Date.now() + HANDLER_PEOPLE_CIRCUIT_COOLDOWN_MS;
    });
  return cached;
}

/** Test-only reset for the in-memory connectivity circuit. */
export function resetHandlerHydrationCircuit(): void {
  handlerHydrationCircuitOpenUntil = 0;
}
