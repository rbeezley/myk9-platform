/**
 * PostgREST filter value helpers for user-typed search text.
 *
 * Inside an `.or(...)` / `.and(...)` string, `,` `(` `)` and `.` are syntax and
 * PostgREST does not accept backslash escapes for them (MYK9-2148:
 * `name.ilike.*Rex\, Jr*` is a PGRST100 parse error). The way to carry them is
 * to wrap the value in double quotes, with the wildcards inside the quotes.
 *
 * Checked against a real PostgREST (see the live block in the test file):
 * inside the quotes PostgREST unescapes `\"` to a quote and `\\` to one
 * backslash, so the LIKE escape (`\%`) must be doubled once more to reach the
 * `ilike` as `\%`. PostgREST also rewrites every `*` in a like value to `%`, even
 * after a backslash, so a literal `*` cannot be matched; it becomes `_`.
 */

/**
 * Escapes a term for a LIKE pattern: a typed `\`, `%` and `_` match
 * themselves, and a typed `*` (which PostgREST would turn into `%`) matches
 * any one character. Use alone for a value handed to a supabase-js method such
 * as `.ilike('breed', ...)`, which URL-encodes it.
 */
export function escapeLikeTerm(input: string): string {
  if (!input) return '';
  return input.replace(/[\\%_]/g, ch => `\\${ch}`).replace(/\*/g, '_');
}

/**
 * The quoted, wildcard-wrapped value for an `ilike` inside a PostgREST filter
 * string (contains match), e.g. `"%Rex, Jr (CH)%"`.
 *
 * ```ts
 * query.or(`name.ilike.${ilikeContains(term)},location.ilike.${ilikeContains(term)}`);
 * ```
 */
export function ilikeContains(input: string): string {
  const quoted = escapeLikeTerm(input).replace(/[\\"]/g, ch => `\\${ch}`);
  return `"%${quoted}%"`;
}
