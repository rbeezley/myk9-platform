/**
 * Scratch Entries Table
 *
 * Shows entries that can be scratched from classes.
 *
 * INTENT: Secretary should feel calm one-tap operations. Scratch uses an inline
 * two-tap confirmation (tap → "Confirm?" appears inline, tap again → done) so
 * the secretary never leaves the table. The full ScratchDialog (with reason field)
 * is still available via onScratch for cases needing a reason.
 */

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, X } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { ScratchableEntry } from './types';

interface ScratchEntriesTableProps {
  entries: ScratchableEntry[];
  /** Called when secretary wants to scratch with a reason (opens full dialog). */
  onScratch: (entry: ScratchableEntry) => void;
  /** Called for a direct no-reason scratch confirmed inline. */
  onScratchDirect?: (entry: ScratchableEntry) => void;
}

interface ScratchCellProps {
  entry: ScratchableEntry;
  onScratch: (entry: ScratchableEntry) => void;
  onScratchDirect?: ((entry: ScratchableEntry) => void) | undefined;
  pendingId: string | null;
  setPendingId: (id: string | null) => void;
}

/** Inline two-tap scratch cell: first tap arms the confirm state, second tap fires. */
function ScratchCell({
  entry,
  onScratch,
  onScratchDirect,
  pendingId,
  setPendingId,
}: ScratchCellProps) {
  const isPending = pendingId === entry.id;

  if (isPending) {
    return (
      <div className="flex items-center justify-end gap-2">
        <Button
          size="default"
          variant="destructive"
          onClick={() => {
            setPendingId(null);
            if (onScratchDirect) {
              onScratchDirect(entry);
            } else {
              onScratch(entry);
            }
          }}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Confirm Scratch
        </Button>
        <Button
          size="default"
          variant="outline"
          aria-label="Cancel scratch"
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
        Scratch
      </Button>
    </div>
  );
}

export function ScratchEntriesTable({
  entries,
  onScratch,
  onScratchDirect,
}: ScratchEntriesTableProps) {
  // Track which row is in the "armed" confirmation state
  const [pendingId, setPendingId] = useState<string | null>(null);

  const columns: ColumnDef<ScratchableEntry, unknown>[] = useMemo(
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
          <ScratchCell
            entry={row.original}
            onScratch={onScratch}
            onScratchDirect={onScratchDirect}
            pendingId={pendingId}
            setPendingId={setPendingId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [onScratch, onScratchDirect, pendingId, setPendingId]
  );

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
