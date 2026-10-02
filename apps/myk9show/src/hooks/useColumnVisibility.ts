/**
 * Columns can no longer be toggled (owner decision 4, MYK9-929), so a visibility choice stored by
 * the old Columns menu (`datatable-cols-<tableId>`) must not keep hiding columns. DataTable calls
 * this once per table to drop the stale key and uses the caller's column defaults only.
 */
export function clearStaleColumnVisibility(tableId: string | undefined): void {
  if (!tableId) return;
  try {
    localStorage.removeItem(`datatable-cols-${tableId}`);
  } catch {
    // localStorage unavailable
  }
}
