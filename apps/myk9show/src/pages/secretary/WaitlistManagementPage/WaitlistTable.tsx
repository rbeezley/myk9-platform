/**
 * Waitlist Table component for WaitlistManagementPage
 */

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Dog, ArrowUpCircle, Trash2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { WaitlistEntry, ClassWithWaitlistCount, ActionDialogState } from './types';
import { formatDateTime } from './utils';

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  selectedClass: ClassWithWaitlistCount | undefined;
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  onSetActionDialog: (state: ActionDialogState) => void;
}

function buildColumns(
  selectedClass: ClassWithWaitlistCount | undefined,
  onOfferSpot: (entry: WaitlistEntry) => void,
  onRemove: (entry: WaitlistEntry) => void
): ColumnDef<WaitlistEntry, unknown>[] {
  const hasAvailableSpots =
    selectedClass &&
    (!selectedClass.max_entries || selectedClass.accepted_count < selectedClass.max_entries);

  return [
    {
      id: 'position',
      header: 'Position',
      accessorFn: row => row.position,
      cell: ({ row }) => (
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold">
          #{row.original.position}
        </div>
      ),
    },
    {
      id: 'dog',
      header: 'Dog',
      accessorFn: row => row.dog?.name ?? '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Dog className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <span className="font-medium">{row.original.dog?.name || 'Unknown Dog'}</span>
            {row.original.dog?.call_name && (
              <span className="text-muted-foreground ml-1">({row.original.dog.call_name})</span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'added',
      header: 'Added',
      accessorFn: row => row.created_at ?? '',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDateTime(row.original.created_at)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          {hasAvailableSpots && (
            <Button size="sm" onClick={() => onOfferSpot(row.original)}>
              <ArrowUpCircle className="h-4 w-4 mr-1" />
              Offer Spot
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => onRemove(row.original)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function WaitlistTable({
  entries,
  selectedClass,
  isLoading,
  searchTerm,
  onSearchChange,
  onSetActionDialog,
}: WaitlistTableProps) {
  const handleOfferSpot = (entry: WaitlistEntry) => {
    onSetActionDialog({ open: true, action: 'offer', entry });
  };

  const handleRemove = (entry: WaitlistEntry) => {
    onSetActionDialog({ open: true, action: 'remove', entry });
  };

  const columns = useMemo(
    () => buildColumns(selectedClass, handleOfferSpot, handleRemove),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedClass]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Waitlist ({entries.length})
            </CardTitle>
            <CardDescription>
              Entries are ordered by submission time (first come, first served)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable
          tableId="waitlist"
          columns={columns}
          data={entries}
          loading={isLoading}
          globalFilter={searchTerm}
          onGlobalFilterChange={onSearchChange}
          emptyState={
            <div className="text-center py-4 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No entries on waitlist</p>
              <p className="text-sm">
                {searchTerm
                  ? 'No entries match your search'
                  : 'This class has no waitlisted entries'}
              </p>
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
