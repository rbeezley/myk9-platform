/**
 * A multi-value filter in one URL param: `class=a,b`. A single value stays a
 * valid list of one, so every link written before multi-select still works.
 *
 * A comma inside a value is escaped (`%2C`, with `%` as `%25`) so ids of any
 * shape round-trip; real ids are uuids and never need it.
 */

function escapeValue(value: string): string {
  return value.replace(/%/g, '%25').replace(/,/g, '%2C');
}

function unescapeValue(value: string): string {
  return value.replace(/%2C/g, ',').replace(/%25/g, '%');
}

/** The values in a param, in order, without blanks or repeats. `null` is an empty list. */
export function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  const values = raw
    .split(',')
    .map(part => unescapeValue(part.trim()))
    .filter(value => value !== '');
  return [...new Set(values)];
}

/** The param text for a list, or `null` (delete the param) when it is empty. */
export function serializeListParam(values: readonly string[]): string | null {
  const parts = [...new Set(values.filter(value => value !== ''))].map(escapeValue);
  return parts.length === 0 ? null : parts.join(',');
}
