/** The notice id for one row's conflict; the provider shows it, and the reopen button clears it first. */
export function conflictToastId(tableName: string, rowId: string): string {
  return `conflict:${tableName}:${rowId}`;
}
