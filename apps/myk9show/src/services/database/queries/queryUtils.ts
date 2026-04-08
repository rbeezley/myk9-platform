/**
 * Shared query utilities for batch-loading data into lookup Maps.
 *
 * Reduces duplication of the `new Map(items.map(item => [item.id, item]))` pattern
 * used across query files to avoid N+1 reads.
 */

/**
 * Build a Map from an array using a key-extraction function.
 *
 * @example
 * const dogsMap = buildMapFromArray(dogs, d => d.id);
 * const trialsMap = buildMapFromArray(trials, t => t.id);
 */
export function buildMapFromArray<T>(items: T[], keyFn: (item: T) => string): Map<string, T> {
  return new Map(items.map(item => [keyFn(item), item]));
}
