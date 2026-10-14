/**
 * The dog roster reads (getAllDogs, getDogsByOwner, searchDogs,
 * getDogStatistics), server first (MYK9-1139).
 *
 * The dogs replica is not cleared on sign-out (MYK9-202), so on a shared
 * browser it can hold the previous account's dogs until the next account's
 * first sync. A roster answered from a warm replica then shows account B only
 * the rows B's own device already synced: none, or too few. So, the shape of
 * `dogDetailRead.ts` (MYK9-1126):
 *
 * - Online, the server answers. A clean replica copy never wins.
 * - This account's UNSENT dog work (an offline create or edit, pending or
 *   failed and kept for Retry) is laid over the server result, so it shows
 *   before it uploads. The queue read is owner-scoped, so another account's
 *   unsent work on this device never appears.
 * - Only when the server cannot be REACHED (`serverUnreachable`) does the
 *   device copy answer. A server that answered with an error is an error,
 *   never an empty roster, and a cold device copy surfaces its own error.
 */
import { supabase, createDatabaseError, logQuery, type DatabaseError } from '../supabaseClient';
import {
  replicatedDogsTable,
  type ReplicatedDog,
} from '@/services/replication/ReplicatedDogsTable';
import { serverUnreachable } from '../registrations/serverUnreachable';

type DogRow = Record<string, unknown>;

export interface RosterResult<T> {
  data: T;
  error: DatabaseError | null;
}

interface RosterReadOptions<T> {
  /** The server read. Throws (a `createDatabaseError`) when it fails. */
  server: () => Promise<{ data: T }>;
  /** The device copy; throws when it cannot answer (a cold or unreadable replica). */
  device: () => Promise<{ data: T }>;
  /** Lay this account's unsent work over the server's answer; must not throw. */
  overlay: (serverData: T) => Promise<T>;
  table: string;
  operation: string;
  errorData: T;
}

/** PostgREST's `max_rows`: one response never carries more, however many rows match. */
export const DOG_READ_PAGE_SIZE = 1000;

/**
 * Every row of a dogs list, one page at a time. The server's answer is now
 * authoritative, so a roster larger than one page (a secretary's or admin's
 * showAll read) must not be cut at `max_rows`. `readPage` runs a fresh, ordered
 * query for the window, ordered by a unique key so pages never overlap. A failed
 * page throws: the caller reports an error, never a truncated roster.
 */
export async function readAllDogPages<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += DOG_READ_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + DOG_READ_PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    if (page.length < DOG_READ_PAGE_SIZE) return rows;
  }
}

export async function readRosterServerFirst<T>({
  server,
  device,
  overlay,
  table,
  operation,
  errorData,
}: RosterReadOptions<T>): Promise<RosterResult<T>> {
  const startTime = Date.now();
  let serverError: DatabaseError;
  try {
    const { data } = await server();
    const merged = await overlay(data);
    logQuery(table, operation, Date.now() - startTime);
    return { data: merged, error: null };
  } catch (error) {
    serverError = createDatabaseError(error, table, operation);
  }

  if (!serverUnreachable(serverError)) {
    logQuery(table, operation, Date.now() - startTime, serverError.message);
    return { data: errorData, error: serverError };
  }
  try {
    const { data } = await device();
    logQuery(table, `${operation}_device`, Date.now() - startTime);
    return { data, error: null };
  } catch (error) {
    const deviceError = createDatabaseError(error, table, `${operation}_device`);
    logQuery(table, `${operation}_device`, Date.now() - startTime, deviceError.message);
    return { data: errorData, error: deviceError };
  }
}

/**
 * The server rows with their registrations replaced by the roster's own read
 * (`loadDogRegistrations`: the server's registrations with this device's unsent
 * add and delete work merged in), so the roster and the dog page resolve the
 * same primary registration. The rows' own embedded registrations are handed to
 * the read: when it cannot reach the registrations table they stand in for the
 * server's rows, so unsent work is still merged onto them. Completeness follows
 * the read, so a failed read leaves `registrations_read_complete` false.
 */
export async function mergeUnsentRegistrations(
  serverRows: DogRow[],
  load: (
    dogIds: string[],
    embedded: DogRow[]
  ) => Promise<{
    byDog: Map<string, DogRow[]>;
    registrationsReadComplete: boolean;
  }>
): Promise<DogRow[]> {
  if (serverRows.length === 0) return serverRows;
  try {
    const embedded = serverRows.flatMap(row =>
      ((row.registrations as DogRow[] | undefined) ?? []).map(reg => ({ dog_id: row.id, ...reg }))
    );
    const result = await load(
      serverRows.map(row => String(row.id)),
      embedded
    );
    return serverRows.map(row => ({
      ...row,
      registrations: result.byDog.get(String(row.id)) ?? [],
      registrations_read_complete: result.registrationsReadComplete,
    }));
  } catch {
    return serverRows;
  }
}

/**
 * This account's dogs with an unsent mutation, read from the device. Empty when
 * there are none or the queue or replica cannot be read: the server's answer
 * then stands.
 */
async function readOwnUnsentDogs(): Promise<ReplicatedDog[]> {
  try {
    const unsentIds = await replicatedDogsTable.getUnsentRowIds();
    if (unsentIds.size === 0) return [];
    const dogs = await replicatedDogsTable.getAllDogs();
    return dogs.filter(dog => unsentIds.has(dog.id) && !(dog.deletedAt ?? dog.deleted_at));
  } catch {
    return [];
  }
}

/**
 * A dog the server returned, with this device's unsent version of it: the
 * device's fields, the server's owner and co-owner when the device has none.
 */
function mergeDeviceDog(serverRow: DogRow, deviceRow: DogRow): DogRow {
  return {
    ...serverRow,
    ...deviceRow,
    owner: deviceRow.owner ?? serverRow.owner ?? null,
    co_owner_id: deviceRow.co_owner_id ?? serverRow.co_owner_id ?? null,
  };
}

/**
 * The server's rows with this account's unsent dogs laid over them. An unsent
 * dog the server returned replaces the server's version of it (an edit), and is
 * dropped when `inScope` no longer accepts the edited dog. An unsent dog the
 * server did not return is added only when `inScope` accepts it (an offline
 * create), so every row obeys the same ownership or search filter as the server
 * path. `hydrate` maps device dogs to the rows the roster returns.
 */
export async function overlayUnsentDogs(
  serverRows: DogRow[],
  inScope: (dog: ReplicatedDog) => boolean,
  hydrate: (dogs: ReplicatedDog[]) => Promise<DogRow[]>
): Promise<DogRow[]> {
  const unsent = await readOwnUnsentDogs();
  if (unsent.length === 0) return serverRows;
  try {
    const serverById = new Map(serverRows.map(row => [String(row.id), row]));
    // The unsent version is the effective one, so it is what the read's own
    // filter (owner, co-owner, search term) is re-checked against: a pending
    // rename or owner change drops a row the server still matches. An older
    // device row may lack the co-owner, which the server row then supplies.
    const wanted: ReplicatedDog[] = [];
    const dropped = new Set<string>();
    for (const dog of unsent) {
      const onServer = serverById.get(dog.id);
      const coOwnerId = dog.coOwnerId ?? (onServer?.co_owner_id as string | null | undefined);
      const effective = coOwnerId ? { ...dog, coOwnerId } : dog;
      if (inScope(effective)) wanted.push(dog);
      else if (onServer) dropped.add(dog.id);
    }
    if (wanted.length === 0 && dropped.size === 0) return serverRows;

    const deviceRows = new Map((await hydrate(wanted)).map(row => [String(row.id), row]));
    const merged = serverRows
      .filter(row => !dropped.has(String(row.id)))
      .map(row => {
        const deviceRow = deviceRows.get(String(row.id));
        return deviceRow ? mergeDeviceDog(row, deviceRow) : row;
      });
    const added = [...deviceRows.values()].filter(row => !serverById.has(String(row.id)));
    if (added.length === 0) return merged;
    return [...merged, ...added].sort((a, b) =>
      String(a.name ?? '').localeCompare(String(b.name ?? ''))
    );
  } catch {
    return serverRows;
  }
}

/**
 * The dog count with this account's unsent creates added: unsent in-scope dogs
 * the server does not already count. One id lookup for those few dogs, so an
 * upload that landed a moment ago is not counted twice.
 */
export async function overlayUnsentDogCount(
  serverTotal: number,
  inScope: (dog: ReplicatedDog) => boolean
): Promise<number> {
  const candidates = (await readOwnUnsentDogs()).filter(inScope);
  if (candidates.length === 0) return serverTotal;
  try {
    const { data, error } = await supabase
      .from('dogs')
      .select('id')
      .in(
        'id',
        candidates.map(dog => dog.id)
      )
      .is('deleted_at', null);
    if (error) return serverTotal;
    const onServer = new Set((data ?? []).map(row => row.id));
    return serverTotal + candidates.filter(dog => !onServer.has(dog.id)).length;
  } catch {
    return serverTotal;
  }
}
