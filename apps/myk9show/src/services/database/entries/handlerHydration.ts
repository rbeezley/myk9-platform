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

interface CachedHandlerPerson {
  id?: string;
  first_name?: string | null;
  last_name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface HandlerReference {
  handler?: string | null | undefined;
  handler_id?: string | null | undefined;
  handlerId?: string | null | undefined;
  handler_person?: HandlerPersonRow | null | undefined;
  dog?: {
    owner?: {
      id?: string | null | undefined;
      first_name?: string | null | undefined;
      last_name?: string | null | undefined;
    } | null;
  } | null;
}

export function handlerIdFor(reference: HandlerReference): string | undefined {
  const handlerId = reference.handlerId ?? reference.handler_id;
  return handlerId?.trim() || undefined;
}

function ownerIdFor(reference: HandlerReference): string | undefined {
  return reference.dog?.owner?.id?.trim() || undefined;
}

function ownerNeedsHydration(reference: HandlerReference): boolean {
  const owner = reference.dog?.owner;
  return Boolean(
    ownerIdFor(reference) && (!owner?.first_name?.trim() || !owner?.last_name?.trim())
  );
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
  requestGeneration: ReadonlyMap<string, number>
): Promise<void> {
  try {
    const isCurrent = (id: string) => personGenerations.get(id) === requestGeneration.get(id);
    const currentPeople = [...people.values()].filter(person => isCurrent(person.id));
    const cachedPeople = currentPeople.map(person => ({
      id: person.id,
      firstName: person.first_name ?? '',
      lastName: person.last_name ?? '',
    }));
    if (cachedPeople.length > 0) await db.instance.people.bulkPut(cachedPeople);
    const missingIds = ids.filter(id => isCurrent(id) && !people.has(id));
    if (missingIds.length > 0) await db.instance.people.bulkDelete(missingIds);
  } catch {
    // A cache write is an optimization; the current caller already has the
    // authoritative projection and the next read can try again.
  }
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
    await persistAuthoritativeHandlerPeople(ids, fastResult.result, requestGeneration);
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
      await persistAuthoritativeHandlerPeople(ids, result, requestGeneration);
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

export async function loadMissingHandlerPeopleMap(
  entries: readonly HandlerReference[]
): Promise<Map<string, HandlerPersonRow>> {
  const ids = entries.flatMap(entry => {
    const handlerId =
      !entry.handler?.trim() && !entry.handler_person ? handlerIdFor(entry) : undefined;
    const ownerId = ownerNeedsHydration(entry) ? ownerIdFor(entry) : undefined;
    return [handlerId, ownerId].filter((id): id is string => Boolean(id));
  });
  return loadHandlerPeople(ids);
}

export function attachHandlerPerson<T extends Record<string, unknown>>(
  row: T,
  entry: HandlerReference,
  people: ReadonlyMap<string, HandlerPersonRow>
): T {
  const handlerId = handlerIdFor(entry);
  const person = handlerId ? people.get(handlerId) : undefined;
  const ownerId = ownerIdFor(entry);
  const ownerPerson = ownerId ? people.get(ownerId) : undefined;
  if (!person && !ownerPerson) return row;

  const hydrated = { ...row } as T & {
    handler_person?: HandlerPersonRow | null;
    dog?: Record<string, unknown> | null;
  };
  if (person) hydrated.handler_person = person;
  if (ownerPerson && hydrated.dog?.owner && typeof hydrated.dog.owner === 'object') {
    hydrated.dog = {
      ...hydrated.dog,
      owner: {
        ...(hydrated.dog.owner as Record<string, unknown>),
        id: ownerPerson.id,
        first_name: ownerPerson.first_name,
        last_name: ownerPerson.last_name,
      },
    };
  }
  return hydrated as T;
}

export async function hydrateMissingHandlerPeople<T extends Record<string, unknown>>(
  rows: readonly T[]
): Promise<T[]> {
  const people = await loadMissingHandlerPeopleMap(rows);
  return rows.map(row => attachHandlerPerson(row, row, people));
}
