/**
 * Read a migration-backed view column that may be absent during deployment.
 */
export function optionalColumn(row: unknown, column: string): string | undefined {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Like {@link optionalColumn}, but a key that is present with an explicit `null`
 * stays `null`; only an ABSENT key (or a non-string) is `undefined`. For a column
 * where the server's NULL is a value ("nothing remembered") and must compare equal
 * to a local `null`, not to a missing field.
 */
export function optionalNullableColumn(row: unknown, column: string): string | null | undefined {
  const record = row as Record<string, unknown>;
  if (!(column in record)) return undefined;
  const value = record[column];
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
}
