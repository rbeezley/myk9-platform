/**
 * Pull Entries Table
 *
 * Shows entries that can be pulled from classes.
 *
 * INTENT: Secretary should feel calm one-tap operations. Pull uses an inline
 * two-tap confirmation (tap → "Confirm?" appears inline, tap again → done) so
 * the secretary never leaves the table. The full PullDialog (with reason field)
 * is still available via onPull for cases needing a reason.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, X } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { PullableEntry } from './types';

interface PullEntriesTableProps {
  entries: PullableEntry[];
  /** Called when secretary wants to pull with a reason (opens full dialog). */
  onPull: (entry: PullableEntry) => void;
  /** Called for a direct no-reason pull confirmed inline. */
  onPullDirect?: (entry: PullableEntry) => void;
}

interface PullCellProps {
  entry: PullableEntry;
  onPull: (entry: PullableEntry) => void;
  onPullDirect?: ((entry: PullableEntry) => void) | undefined;
  pendingId: string | null;
  setPendingId: (id: string | null) => void;
}

/** Inline two-tap pull cell: first tap arms the confirm state, second tap fires. */
function PullCell({
  entry,
  onPull,
  onPullDirect,
  pendingId,
  setPendingId,
}: PullCellProps) {
  const isPending = pendingId === entry.id;

  if (isPending) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          size="default"
          variant="destructive"
          onClick={() => {
            setPendingId(null);
            if (onPullDirect) {
              onPullDirect(entry);
            } else {
              onPull(entry);
            }
          }}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Confirm Pull
        </Button>
        <Button
          size="default"
          variant="outline"
          aria-label="Cancel pull"
          onClick={() => setPendingId(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="text-right">
      <Button size="default" variant="destructive" onClick={() => setPendingId(entry.id)}>
        <XCircle className="mr-2 h-4 w-4" />
        Pull
      </Button>
    </div>
  );
}

export function PullEntriesTable({
  entries,
  onPull,
  onPullDirect,
}: PullEntriesTableProps) {
  // Track which row is in the "armed" confirmation state
  const [pendingId, setPendingId] = useState<string | null>(null);

  const columns: ColumnDef<PullableEntry, unknown>[] = useMemo(
    () => [
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
          <Badge variant={row.original.entry_status === 'checked-in' ? 'default' : 'outline'}>
            {row.original.entry_status || 'pending'}
          </Badge>
        ),
        meta: { responsiveHide: 'sm' as const },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <PullCell
            entry={row.original}
            onPull={onPull}
            onPullDirect={onPullDirect}
            pendingId={pendingId}
            setPendingId={setPendingId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [onPull, onPullDirect, pendingId, setPendingId]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pull Management</CardTitle>
        <CardDescription>
          Mark entries as pulled (no refund for day-of pulls)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          tableId="pullEntries"
          columns={columns}
          data={entries}
          emptyState="No entries available to pull"
        />
      </CardContent>
    </Card>
  );
}
