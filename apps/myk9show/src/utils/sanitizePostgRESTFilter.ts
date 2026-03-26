/**
 * PostgREST filter sanitization.
 *
 * PostgREST uses a custom filter syntax where certain characters have
 * special meaning (`.` separates column/operator, `,` separates clauses,
 * `(` / `)` group expressions, `%` and `*` are wildcards). When user
 * input is interpolated into `.or()` / `.filter()` strings without
 * escaping, an attacker can manipulate the query logic.
 *
 * This utility escapes those special characters so user-supplied search
 * terms are treated as literal text inside `ilike` patterns.
 */

/**
 * Escapes characters that have special meaning in PostgREST filter syntax.
 *
 * Use this around any user-supplied value before interpolating it into a
 * PostgREST `.or()` / `.filter()` string:
 *
 * ```ts
 * const safe = sanitizePostgRESTFilter(searchTerm);
 * query.or(`name.ilike.%${safe}%,location.ilike.%${safe}%`);
 * ```
 */
export function sanitizePostgRESTFilter(input: string): string {
  if (!input) return '';

  // Backslash-escape characters that PostgREST interprets as syntax
  return input
    .replace(/\\/g, '\\\\') // escape existing backslashes first
    .replace(/\./g, '\\.')
    .replace(/,/g, '\\,')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/%/g, '\\%')
    .replace(/\*/g, '\\*');
}
