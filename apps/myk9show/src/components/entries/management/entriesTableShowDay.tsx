/**
 * Show-day display-preset helpers for `EntriesTableView` (spec scenario
 * "Show-day display is selected"): armband, dog, class, and check-in
 * information receive PRIORITY. Pure reorder + one added visible action —
 * nothing is hidden; identity, status, selection, and the row action menu
 * are always retained (Design Decision 3).
 */
import { type ColumnDef, type DisplayColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import type { EntryManagementEntry } from '@/types/entry-management-types';

/** Show-day quick check-in column — visible per-row action so check-in gets priority. */
export function buildCheckInColumn(
  onCheckInEntry: (entryId: string) => void
): DisplayColumnDef<EntryManagementEntry, unknown> {
  return {
    id: '_check_in',
    header: 'Check-in',
    cell: ({ row }) => (
      <span onClick={e => e.stopPropagation()} role="presentation">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          aria-label={`Check in ${row.original.dogName}`}
          onClick={() => onCheckInEntry(row.original.id)}
        >
          Check in
        </Button>
      </span>
    ),
    enableSorting: false,
    enableHiding: false,
    meta: { interactive: true, exportDisabled: true } satisfies DataTableColumnMeta,
  };
}

/**
 * Show-day PRIORITY ordering: armband, dog, classes, status lead; handler
 * and date trail (stable sort keeps their relative order). Pure reorder —
 * no column is removed.
 */
export function applyShowDayColumnOrder(
  columns: ColumnDef<EntryManagementEntry, unknown>[]
): void {
  const priority = ['armbandNumber', 'dogName', 'classes', 'entryStatus'];
  const keyOf = (col: ColumnDef<EntryManagementEntry, unknown>) =>
    'accessorKey' in col ? String(col.accessorKey) : (col.id ?? '');
  const rank = (col: ColumnDef<EntryManagementEntry, unknown>) => {
    const index = priority.indexOf(keyOf(col));
    return index === -1 ? priority.length : index;
  };
  columns.sort((a, b) => rank(a) - rank(b));
}
