import type { ReplicatedReadResult } from '@myk9/replication';

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
  if (!result.ok) throw new Error(message);
  return result.rows;
}
