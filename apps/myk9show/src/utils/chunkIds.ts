/**
 * Split a list into fixed-size batches.
 *
 * Exists because a PostgREST `.in('col', ids)` filter is carried in the URL,
 * so an unbounded id list eventually produces a request the server rejects
 * outright. The rejection arrives without CORS headers, so the browser reports
 * it as a CORS failure and the console names the wrong cause entirely.
 *
 * It scales with data, which is what makes it dangerous: small accounts never
 * reach the limit and large ones fail every time.
 *
 * Batch size stays with the caller — it depends on that query's row width and
 * on whether a page limit could truncate the result.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) throw new RangeError(`chunk size must be >= 1, received ${size}`);
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    batches.push(items.slice(offset, offset + size));
  }
  return batches;
}

/**
 * Default batch for UUID id lists.
 *
 * 100 v4 UUIDs plus separators is roughly 3.7 KB of query string — comfortably
 * inside every proxy limit in the path, with room for the rest of the URL.
 */
export const ID_CHUNK_SIZE = 100;
