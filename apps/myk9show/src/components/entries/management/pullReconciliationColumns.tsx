import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { PullReconciliationActions } from './PullReconciliationActions';

function timingLabel(entry: EntryManagementEntry): string {
  if (entry.pullTiming === 'before_close') return 'Before close';
  if (entry.pullTiming === 'after_close') return 'After close';
  return 'Timing unknown';
}

export function buildPullReconciliationColumns({
  onOpenRefund,
  onResolved,
}: {
  onOpenRefund: (entry: EntryManagementEntry) => void;
  onResolved: () => void;
}): ColumnDef<EntryManagementEntry, unknown>[] {
  return [
    {
      accessorKey: 'pullReason',
      header: 'Pull reason',
      cell: ({ row }) =>
        row.original.pullReason || <span className="text-muted-foreground">—</span>,
      meta: {
        exportValue: row => (row as EntryManagementEntry).pullReason ?? '',
      } satisfies DataTableColumnMeta,
    },
    {
      accessorKey: 'pullTiming',
      header: 'Pull timing',
      cell: ({ row }) => timingLabel(row.original),
      meta: {
        exportValue: row => timingLabel(row as EntryManagementEntry),
      } satisfies DataTableColumnMeta,
    },
    {
      id: '_pull_reconciliation',
      header: 'Refund decision',
      cell: ({ row }) => (
        <PullReconciliationActions
          entry={row.original}
          onOpenRefund={onOpenRefund}
          onResolved={onResolved}
        />
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { interactive: true, exportDisabled: true } satisfies DataTableColumnMeta,
    },
  ];
}
