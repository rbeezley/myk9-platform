import { useMyEntries } from '@/hooks/useMyEntries';
import { useViewPreference, CARD_TABLE_MODES } from '@/hooks/useViewPreference';
import { LiveClassCard } from '@/components/live/LiveClassCard';
import { ViewToggle } from '@/components/common/ViewToggle';
import { EmptyState } from '@/components/common/EmptyState';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';

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
    id: 'progress',
    header: 'Progress',
    meta: { responsiveHide: 'md' as const },
    cell: () => <span className="text-muted-foreground">&mdash;</span>,
    enableSorting: false,
  },
  {
    id: 'myDog',
    header: 'My Dog',
    cell: ({ row }) => (
      <span>
        {row.original.dogName}
        {row.original.armband && (
          <span className="ml-1 text-muted-foreground">#{row.original.armband}</span>
        )}
      </span>
    ),
    enableSorting: false,
  },
  {
    id: 'position',
    header: 'Position',
    cell: ({ row }) => {
      const { scored, dogsAhead } = row.original;
      if (scored) return 'Completed';
      if (dogsAhead === 0) return 'Next up';
      return `${dogsAhead} ahead`;
    },
    enableSorting: false,
  },
];

export function MyEntriesTab({ showId }: MyEntriesTabProps) {
  const { entriesByClass, isLoading, isError } = useMyEntries(showId);
  const [viewMode, setViewMode] = useViewPreference('entries', 'cards');

  if (isLoading) {
    return <LoadingSkeleton variant="cards" count={3} />;
  }

  if (isError) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <p>Could not load your entries. Please try again.</p>
      </div>
    );
  }

  if (entriesByClass.length === 0) {
    return (
      <EmptyState
        icon={Search}
        title="No entries in this show"
        description="You haven't entered any classes in this show yet."
        action={{ label: 'Browse Classes', onClick: () => {} }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {entriesByClass.length} class{entriesByClass.length !== 1 ? 'es' : ''}
        </p>
        <ViewToggle modes={CARD_TABLE_MODES} active={viewMode} onChange={setViewMode} />
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
