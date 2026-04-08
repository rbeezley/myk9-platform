/**
 * Shared mapper utilities for converting camelCase replicated types
 * to snake_case DB row shapes (Record<string, unknown>).
 *
 * These helpers reduce boilerplate in the per-entity mapper files.
 */

/**
 * A field mapping entry. Each key is the snake_case DB column name,
 * and the value is one of:
 *   - a string: the camelCase property name on the source object
 *   - a [string, unknown] tuple: [camelCase property name, default value]
 *
 * When the source value is `undefined`, `?? null` is applied (or the
 * explicit default when a tuple is provided).
 */
export type FieldMapping = Record<string, string | [string, unknown]>;

/**
 * Build a `Record<string, unknown>` DB row from a source object and a
 * field mapping declaration.
 *
 * For each entry in `mapping`:
 *   - If the value is a string, read `source[value] ?? null`.
 *   - If the value is a `[key, default]` tuple, read `source[key] ?? default`.
 *
 * Fields that need custom transformation (nested objects, computed values)
 * should NOT go through this helper — set them directly on the returned row.
 *
 * @example
 * ```ts
 * const row = mapFields(trial, {
 *   id: 'id',
 *   show_id: 'showId',
 *   name: 'name',
 *   trial_number: 'trialNumber',
 *   status: 'status',
 * });
 * ```
 */
export function mapFields(
  source: Record<string, unknown>,
  mapping: FieldMapping
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  for (const [dbKey, spec] of Object.entries(mapping)) {
    if (Array.isArray(spec)) {
      const [sourceKey, defaultValue] = spec;
      row[dbKey] = (source as Record<string, unknown>)[sourceKey] ?? defaultValue;
    } else {
      row[dbKey] = (source as Record<string, unknown>)[spec] ?? null;
    }
  }

  return row;
}
