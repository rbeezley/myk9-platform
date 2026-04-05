import { useNavigate } from 'react-router-dom';
import { useMyEntries } from '@/hooks/useMyEntries';
import { useEntryStore } from '@/store/entryStore';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { LiveClassCard } from '@/components/live/LiveClassCard';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Search, Plus, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRBAC } from '@/hooks/useRBAC';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';

interface MyEntriesTabProps {
  showId: string;
}

interface MyEntryRow {
  classId: string;
  className: string;
  dogName: string;
  armband: string;
  runOrder: number;
  dogsAhead: number;
  scored: boolean;
  checkInStatus: CheckInStatus;
}

const myEntryColumns: ColumnDef<MyEntryRow, unknown>[] = [
  {
    accessorKey: 'className',
    header: 'Class',
  },
  {
    accessorKey: 'scored',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={cn(
          'px-2 py-0.5 rounded text-xs font-medium',
          row.original.scored
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
        )}
      >
        {row.original.scored ? 'Scored' : 'Pending'}
      </span>
    ),
  },
  {
    id: 'checkInStatus',
    header: 'Check-in',
    cell: ({ row }) => <CheckInStatusBadge status={row.original.checkInStatus} size="sm" />,
  },
  {
    id: 'progress',
    header: 'Progress',
    meta: { responsiveHide: 'md' as const },
    cell: () => <span className="text-muted-foreground">&mdash;</span>,
    enableSorting: false,
  },
  {
    id: 'myDog',
    header: 'My Dog',
    accessorFn: row => row.dogName,
    cell: ({ row }) => (
      <span>
        {row.original.dogName}
        {row.original.armband && (
          <span className="ml-1 text-muted-foreground">#{row.original.armband}</span>
        )}
      </span>
    ),
  },
  {
    id: 'position',
    header: 'Position',
    accessorFn: row => (row.scored ? Infinity : row.dogsAhead),
    cell: ({ row }) => {
      const { scored, dogsAhead } = row.original;
      if (scored) return 'Completed';
      if (dogsAhead === 0) return 'Next up';
      return `${dogsAhead} ahead`;
    },
  },
];

export function MyEntriesTab({ showId }: MyEntriesTabProps) {
  const navigate = useNavigate();
  const { hasPermission } = useRBAC();
  const { entriesByClass, isLoading, isError } = useMyEntries(showId);
  const loadEntries = useEntryStore(s => s.loadEntries);
  const [viewMode, setViewMode] = useViewPreference('entries', 'cards');
  const canManage = hasPermission('admin:manage') || hasPermission('show:manage');

  if (isLoading) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  if (isError) {
    return (
      <div className="py-12 text-center space-y-4">
        <p className="text-muted-foreground">
          Failed to load your entries. Please check your connection.
        </p>
        <Button variant="outline" onClick={() => void loadEntries()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (entriesByClass.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No entries in this show"
        description="You haven't entered any classes in this show yet."
        action={{
          label: 'Browse Classes',
          onClick: () => navigate(`/shows/${showId}?tab=classes`),
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {entriesByClass.length} class{entriesByClass.length !== 1 ? 'es' : ''}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
          {canManage && (
            <Button
              size="sm"
              onClick={() => navigate(`/secretary/register/${showId}`)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Entry
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'cards' ? (
        <div className="grid gap-4">
          {entriesByClass.map(entry => (
            <LiveClassCard
              key={entry.classId}
              classTitle={entry.className}
              status={entry.scored ? 'completed' : 'in_progress'}
              userDogsAhead={entry.dogsAhead}
              userDogName={entry.dogName}
            />
          ))}
        </div>
      ) : (
        <DataTable
          tableId="myEntriesTab"
          columns={myEntryColumns}
          data={entriesByClass}
          getRowId={row => row.classId}
        />
      )}
    </div>
  );
}
