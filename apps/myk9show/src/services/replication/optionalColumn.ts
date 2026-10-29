/**
 * Read a migration-backed view column that may be absent during deployment.
 */
export function optionalColumn(row: unknown, column: string): string | undefined {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read a numeric migration-backed view column that may be absent during deployment.
 */
export function optionalNumberColumn(row: unknown, column: string): number | undefined {
  const value = (row as Record<string, unknown>)[column];
  return typeof value === 'number' ? value : undefined;
}
