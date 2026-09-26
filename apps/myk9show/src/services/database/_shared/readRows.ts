import type { ReplicatedReadResult } from '@myk9/replication';
import { logger } from '@/services/LoggingService';

/**
 * The rows of a replicated read, or a throw when the device could not read.
 * getAll() hands back [] for a failed IndexedDB read, which every join or count
 * built on it then reports as "there are none" (MYK9-774). Callers catch the
 * throw and show an error, or fall back to the server.
 */
export async function rowsOrThrow<T>(
  read: Promise<ReplicatedReadResult<T>>,
  message: string
): Promise<T[]> {
  const result = await read;
  // Named like ReplicatedTable.getAllOrThrow's error, so a server fallback
  // guards unsynced writes for it too.
  if (!result.ok) throw Object.assign(new Error(message), { name: 'ReplicaReadError' });
  return result.rows;
}

/**
 * Rows for an optional join, or [] with a warning when the device could not
 * read them (MYK9-774).
 *
 * Use only for a lookup that labels or counts the rows a read is about (class
 * names on entries, trial dates on classes), never for those rows themselves.
 * Throwing here would discard readable primary rows and their unsynced writes:
 * the read would fall back to a server list that shows a pending check-in,
 * edit or offline-created entry as undone. A missing label is the smaller harm.
 */
export async function joinRowsOrEmpty<T>(read: Promise<T[]>, join: string): Promise<T[]> {
  try {
    return await read;
  } catch (error) {
    logger.warn(`Join read failed on this device; ${join} left out`, 'database', {
      join,
      error: String(error),
    });
    return [];
  }
}
