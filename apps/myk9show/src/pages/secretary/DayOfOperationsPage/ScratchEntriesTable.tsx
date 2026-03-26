/**
 * Scratch Entries Table
 *
 * Shows entries that can be scratched from classes
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { ScratchableEntry } from './types';

interface ScratchEntriesTableProps {
  entries: ScratchableEntry[];
  onScratch: (entry: ScratchableEntry) => void;
}

function buildColumns(
  onScratch: (entry: ScratchableEntry) => void
): ColumnDef<ScratchableEntry, unknown>[] {
  return [
    {
      accessorKey: 'armband',
      header: 'Armband',
      cell: ({ row }) => <span className="font-mono">{row.original.armband || '-'}</span>,
    },
    {
      id: 'dog',
      header: 'Dog',
      accessorFn: row => row.dog?.name ?? '',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.dog?.name}</div>
          {row.original.dog?.call_name && (
            <div className="text-sm text-muted-foreground">
              &quot;{row.original.dog.call_name}&quot;
            </div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'handler',
      header: 'Handler',
      cell: ({ row }) => row.original.handler || '-',
      meta: { responsiveHide: 'md' as const },
    },
    {
      id: 'class',
      header: 'Class',
      accessorFn: row => row.class?.name ?? '',
      cell: ({ row }) => (
        <span>
          {row.original.class?.class_number && (
            <span className="text-muted-foreground mr-1">#{row.original.class.class_number}</span>
          )}
          {row.original.class?.name}
        </span>
      ),
    },
    {
      id: 'check_in',
      header: 'Check-in',
      accessorFn: row => row.entry_status ?? 'pending',
      cell: ({ row }) => (
        <Badge variant={row.original.entry_status === 'checked_in' ? 'default' : 'outline'}>
          {row.original.entry_status || 'pending'}
        </Badge>
      ),
      meta: { responsiveHide: 'sm' as const },
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="text-right">
          <Button size="sm" variant="destructive" onClick={() => onScratch(row.original)}>
            <XCircle className="mr-2 h-4 w-4" />
            Scratch
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function ScratchEntriesTable({ entries, onScratch }: ScratchEntriesTableProps) {
  const columns = buildColumns(onScratch);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scratch Management</CardTitle>
        <CardDescription>
          Mark entries as scratched (no refund for day-of scratches)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          tableId="scratchEntries"
          columns={columns}
          data={entries}
          emptyState="No entries available to scratch"
        />
      </CardContent>
    </Card>
  );
}
