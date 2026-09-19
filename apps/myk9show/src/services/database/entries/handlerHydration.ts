import { supabase } from '../supabaseClient';

export interface HandlerPersonRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export interface HandlerReference {
  handler?: string | null | undefined;
  handler_id?: string | null | undefined;
  handlerId?: string | null | undefined;
}

export function handlerIdFor(reference: HandlerReference): string | undefined {
  const handlerId = reference.handlerId ?? reference.handler_id;
  return handlerId?.trim() || undefined;
}

export async function loadHandlerPeople(
  handlerIds: readonly string[]
): Promise<Map<string, HandlerPersonRow>> {
  const ids = [...new Set(handlerIds.map(id => id.trim()).filter(Boolean))];
  if (ids.length === 0) return new Map();

  try {
    const { data, error } = await supabase
      .from('people')
      .select('id, first_name, last_name')
      .in('id', ids);
    if (error || !data) return new Map();
    return new Map((data as HandlerPersonRow[]).map(person => [person.id, person]));
  } catch {
    return new Map();
  }
}

export async function loadMissingHandlerPeopleMap(
  entries: readonly HandlerReference[]
): Promise<Map<string, HandlerPersonRow>> {
  return loadHandlerPeople(
    entries
      .filter(entry => !entry.handler?.trim())
      .map(handlerIdFor)
      .filter((id): id is string => Boolean(id))
  );
}

export function attachHandlerPerson<T extends Record<string, unknown>>(
  row: T,
  entry: HandlerReference,
  people: ReadonlyMap<string, HandlerPersonRow>
): T {
  const handlerId = handlerIdFor(entry);
  const person = handlerId ? people.get(handlerId) : undefined;
  return (person ? { ...row, handler_person: person } : row) as T;
}

export async function hydrateMissingHandlerPeople<T extends Record<string, unknown>>(
  rows: readonly T[]
): Promise<T[]> {
  const people = await loadMissingHandlerPeopleMap(rows);
  return rows.map(row => attachHandlerPerson(row, row, people));
}
