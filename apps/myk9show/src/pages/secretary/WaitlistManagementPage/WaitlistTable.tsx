/**
 * Waitlist Table component for WaitlistManagementPage: one class's queue, in join order.
 */

import { useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Dog, ArrowUpCircle, Trash2 } from 'lucide-react';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import type { WaitlistEntry, ClassWithWaitlistCount, ActionDialogState } from './types';
import { formatEntryDate, formatEntryDateTime } from '@/lib/format/dates';
import type { ClassSpotState } from '@/features/waiting-for-you';
import { SpotOpenNotice } from './SpotOpenNotice';
import { waitlistDogName } from './spotEntry';

interface WaitlistTableProps {
  entries: WaitlistEntry[];
  selectedClass: ClassWithWaitlistCount;
  isLoading: boolean;
  searchActive: boolean;
  /** Offer and Remove are online calls: offline they are disabled, with the reason beside them. */
  offline?: boolean;
  /** Whether a spot is open in this class (`findOpenWaitlistSpots`); absent while it is not decided. */
  spot?: ClassSpotState | undefined;
  /**
   * The show's "Offer open spots automatically" setting: false recommends a dog, true offers no
   * recommendation, null (not read yet) shows no offer at all.
   */
  autoOffer?: boolean | null;
  /** The row behind `spot.nextInLine`, from the class's whole queue. */
  nextEntry?: WaitlistEntry | null;
  onSetActionDialog: (state: ActionDialogState) => void;
}

function buildColumns(
  onOfferSpot: (entry: WaitlistEntry) => void,
  onRemove: (entry: WaitlistEntry) => void,
  offline: boolean,
  spot: ClassSpotState | undefined,
  recommended: WaitlistEntry | null,
  settingKnown: boolean
): ColumnDef<WaitlistEntry, unknown>[] {
  // Offer only where a spot is open: both the class's limit and the judge's day have room.
  const hasAvailableSpots = spot?.reason === 'open' && settingKnown;

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
      accessorFn: row => row.dog?.call_name ?? row.dog?.name ?? '',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Dog className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <span className="font-medium">{waitlistDogName(row.original)}</span>
            {row.original.dog?.name && row.original.dog.name !== row.original.dog.call_name && (
              <span className="text-muted-foreground ml-1">({row.original.dog.name})</span>
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
          {formatEntryDateTime(row.original.created_at) || 'Unknown'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          {hasAvailableSpots && row.original.id === recommended?.id && (
            <span className="text-xs font-medium text-primary">Next in line</span>
          )}
          {/* The recommended dog's one main button is in the notice above the list. */}
          {hasAvailableSpots && row.original.id !== recommended?.id && (
            <Button
              variant="outline"
              disabled={offline}
              aria-label={`Offer spot to ${waitlistDogName(row.original)}`}
              onClick={() => onOfferSpot(row.original)}
            >
              <ArrowUpCircle className="h-4 w-4 mr-1" />
              Offer
            </Button>
          )}
          <Button variant="destructive" disabled={offline} onClick={() => onRemove(row.original)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Remove
          </Button>
          {offline && (
            <span className="text-xs text-muted-foreground" data-testid="waitlist-online-only">
              Online only
            </span>
          )}
        </div>
      ),
      meta: { interactive: true },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

export function WaitlistTable({
  entries,
  selectedClass,
  isLoading,
  searchActive,
  offline = false,
  spot,
  autoOffer = null,
  nextEntry = null,
  onSetActionDialog,
}: WaitlistTableProps) {
  const handleOfferSpot = useCallback(
    (entry: WaitlistEntry) => {
      onSetActionDialog({ open: true, action: 'offer', entry });
    },
    [onSetActionDialog]
  );

  const handleRemove = useCallback(
    (entry: WaitlistEntry) => {
      onSetActionDialog({ open: true, action: 'remove', entry });
    },
    [onSetActionDialog]
  );

  // The recommended dog has its button in the notice; with automatic offering on, none is
  // recommended and every row keeps its own quiet "Offer".
  const recommended = spot?.reason === 'open' && autoOffer === false ? nextEntry : null;
  const columns = useMemo(
    () =>
      buildColumns(handleOfferSpot, handleRemove, offline, spot, recommended, autoOffer !== null),
    [handleOfferSpot, handleRemove, offline, spot, recommended, autoOffer]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {selectedClass.class_number ? `#${selectedClass.class_number} - ` : ''}
              {selectedClass.name} ({entries.length})
            </CardTitle>
            {/* Shows repeat a class across trials, so name the trial and its day. The date is a
                calendar date (no time), so it needs no timezone conversion. */}
            {selectedClass.trial && (
              <p className="text-sm font-medium text-muted-foreground">
                {[selectedClass.trial.name, formatEntryDate(selectedClass.trial.date)]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            <CardDescription>
              In join order (first come, first served) &middot; {selectedClass.accepted_count}
              {selectedClass.max_entries ? ` of ${selectedClass.max_entries}` : ''} entered
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {spot && (
          <SpotOpenNotice
            spot={spot}
            nextEntry={nextEntry}
            autoOffer={autoOffer}
            offline={offline}
            onOffer={handleOfferSpot}
          />
        )}
        <DataTable
          tableId={`waitlist-${selectedClass.id}`}
          columns={columns}
          data={entries}
          loading={isLoading}
          emptyState={
            <div className="text-center py-4 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No entries on waitlist</p>
              <p className="text-sm">
                {searchActive
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
