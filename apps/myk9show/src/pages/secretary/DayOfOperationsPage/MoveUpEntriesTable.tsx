/**
 * Move-Up Entries Table
 *
 * Shows entries eligible for move-up to a higher class
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { ScratchableEntry } from './types';

interface MoveUpEntriesTableProps {
  entries: ScratchableEntry[];
  onMoveUp: (entry: ScratchableEntry) => void;
}

function buildColumns(
  onMoveUp: (entry: ScratchableEntry) => void
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
      id: 'current_class',
      header: 'Current Class',
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
      id: 'status',
      header: 'Status',
      accessorFn: row => row.entry_status ?? '',
      cell: ({ row }) => (
        <Badge variant={row.original.entry_status === 'checked_in' ? 'default' : 'outline'}>
          {row.original.entry_status}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="text-right">
          <Button size="sm" onClick={() => onMoveUp(row.original)}>
            <ArrowUpCircle className="mr-2 h-4 w-4" />
            Move Up
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function MoveUpEntriesTable({ entries, onMoveUp }: MoveUpEntriesTableProps) {
  const columns = buildColumns(onMoveUp);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Move-Up Eligible Entries</CardTitle>
        <CardDescription>
          Entries that can be moved to a higher class after qualifying
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          tableId="move-up-entries"
          columns={columns}
          data={entries}
          emptyState="No entries available for move-up"
        />
      </CardContent>
    </Card>
  );
}
