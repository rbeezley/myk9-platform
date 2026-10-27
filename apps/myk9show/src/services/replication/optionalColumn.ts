/**
 * Read a migration-backed view column that may be absent during deployment.
 */
export function optionalColumn(row: unknown, column: string): string | undefined {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'string' ? value : undefined;
}
