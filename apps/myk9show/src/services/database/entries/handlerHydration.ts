import { supabase } from '../supabaseClient';
import { db } from '../connection';
import { withTimeout } from '@myk9/core';

const HANDLER_PEOPLE_TIMEOUT_MS = 3000;

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

export async function loadHandlerPeople(
  handlerIds: readonly string[]
): Promise<Map<string, HandlerPersonRow>> {
  const ids = [...new Set(handlerIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const cached = await loadCachedHandlerPeople(ids);

  try {
    // Refresh every cached id so a renamed person cannot remain stale forever.
    // The local cache is still the safe result when the network is unavailable.
    const { data, error } = await withTimeout(
      supabase.from('people').select('id, first_name, last_name').in('id', ids),
      HANDLER_PEOPLE_TIMEOUT_MS,
      'entry handler identity hydration'
    );
    if (error || !data) return cached;
    return new Map([
      ...cached,
      ...(data as HandlerPersonRow[]).map(person => [person.id, person] as const),
    ]);
  } catch {
    return cached;
  }
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
