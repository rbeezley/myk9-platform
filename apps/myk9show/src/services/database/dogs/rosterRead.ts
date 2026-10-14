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
 * - A roster larger than one response is read page by page (keyset on `id`),
 *   because the server's answer is authoritative.
 * - Only when the server cannot be REACHED (`serverUnreachable`) does the
 *   device copy answer. A server that answered with an error is an error,
 *   never an empty roster, and a cold device copy surfaces its own error.
 */
import { createDatabaseError, logQuery, type DatabaseError } from '../supabaseClient';
import { serverUnreachable } from '../registrations/serverUnreachable';

export interface RosterResult<T> {
  data: T;
  error: DatabaseError | null;
}

interface RosterReadOptions<T> {
  /** The server read. Throws (a `createDatabaseError`) when it fails. */
  server: () => Promise<{ data: T }>;
  /** The device copy; throws when it cannot answer (a cold or unreadable replica). */
  device: () => Promise<{ data: T }>;
  table: string;
  operation: string;
  errorData: T;
}

/** PostgREST's `max_rows`: one response never carries more, however many rows match. */
export const DOG_READ_PAGE_SIZE = 1000;

/**
 * Every row of a dogs list, one page at a time. The server's answer is
 * authoritative, so a roster larger than one page (a secretary's or admin's
 * showAll read) must not be cut at `max_rows`.
 *
 * KEYSET paging on the unique `id` (as `ReplicatedDogsTable.reconcileDeleted`
 * does), not offset: a dog inserted or deleted between two page fetches shifts
 * offset windows and skips or repeats a row, while "ids after the last one seen"
 * cannot. `readPage(afterId)` runs a fresh query ordered by `id`, limited to a
 * page, for ids strictly after `afterId` (undefined for the first page). A
 * failed page throws: the caller reports an error, never a truncated roster.
 */
export async function readAllDogPages<T extends { id: unknown }>(
  readPage: (afterId: string | undefined) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  let afterId: string | undefined;
  for (;;) {
    const { data, error } = await readPage(afterId);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    const last = page[page.length - 1];
    if (page.length < DOG_READ_PAGE_SIZE || !last) return rows;
    afterId = String(last.id);
  }
}

export async function readRosterServerFirst<T>({
  server,
  device,
  table,
  operation,
  errorData,
}: RosterReadOptions<T>): Promise<RosterResult<T>> {
  const startTime = Date.now();
  let serverError: DatabaseError;
  try {
    const { data } = await server();
    logQuery(table, operation, Date.now() - startTime);
    return { data, error: null };
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
