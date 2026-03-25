import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
import { type ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
} from '@/components/ui/data-table';
import { ClipboardList } from 'lucide-react';
import { getEntryStatusClasses } from '@/utils/entryManagementUtils';

interface TrialEntriesTableProps {
  trialId: string;
}

interface EntryRecord {
  id: string;
  handler: string | null;
  entry_status: string | null;
  entry_fee: number | null;
  armband: string | null;
  created_at: string | null;
  dog: {
    id: string;
    name: string;
    call_name: string | null;
    breed: string | null;
    owner: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
  } | null;
  class: {
    id: string;
    name: string | null;
    class_number: string | null;
    entry_fee: number | null;
  } | null;
}

interface DisplayEntry {
  id: string;
  dogName: string;
  breed: string;
  className: string;
  handler: string;
  status: string;
  armband: string;
  date: string;
  rawDate: string;
}

const COLUMNS: ColumnDef<DisplayEntry, unknown>[] = [
  {
    accessorKey: 'armband',
    header: 'Armband',
    cell: ({ row }) => (
      <span className="font-mono">{row.original.armband || '--'}</span>
    ),
  },
  {
    accessorKey: 'dogName',
    header: 'Dog',
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.dogName}</div>
        {row.original.breed && (
          <div className="text-xs text-muted-foreground">{row.original.breed}</div>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'className',
    header: 'Class',
  },
  {
    accessorKey: 'handler',
    header: 'Handler',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <span
        className={`inline-block px-3 py-1 text-xs font-semibold rounded-full capitalize ${getEntryStatusClasses(row.original.status)}`}
      >
        {row.original.status}
      </span>
    ),
  },
  {
    id: 'date',
    header: 'Registered',
    accessorFn: e => e.rawDate,
    sortingFn: 'datetime',
    cell: ({ row }) => row.original.date,
  },
];

const EMPTY_STATE = (
  <div className="text-center py-12">
    <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
      <ClipboardList className="h-7 w-7 text-muted-foreground" />
    </div>
    <div className="text-muted-foreground">
      <div className="mb-2 text-lg font-medium">No entries yet</div>
      <div className="text-sm">
        Entries will appear here once exhibitors register for this trial.
      </div>
    </div>
  </div>
);

export const TrialEntriesTable = ({ trialId }: TrialEntriesTableProps) => {
  const {
    data: rawEntries = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['trials', trialId, 'entries'],
    queryFn: async () => {
      const { data, error } = await getEntriesByTrial(trialId);
      if (error) throw error;
      return data;
    },
    enabled: !!trialId,
    ...cacheStrategies.dynamic,
  });

  // Map raw entries to display format
  const entries: DisplayEntry[] = useMemo(() => {
    return rawEntries.map((e: unknown) => {
      const raw = e as EntryRecord;
      const dog = raw.dog;
      const cls = raw.class;
      const owner = dog?.owner;

      const handlerName =
        raw.handler || (owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : '');

      return {
        id: raw.id,
        dogName: dog?.call_name || dog?.name || 'Unknown',
        breed: dog?.breed || '',
        className: cls?.name || 'Unknown',
        handler: handlerName || 'Unknown',
        status: raw.entry_status || 'pending',
        armband: raw.armband || '',
        date: raw.created_at ? new Date(raw.created_at).toLocaleDateString() : '',
        rawDate: raw.created_at || '',
      };
    });
  }, [rawEntries]);

  if (isError) {
    return (
      <div className="text-center py-12">
        <div className="text-destructive mb-2">Failed to load entries</div>
        <p className="text-sm text-muted-foreground">
          There was an error fetching the entries for this trial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Entries ({entries.length})</h3>
          <p className="text-sm text-muted-foreground">All entries registered for this trial</p>
        </div>
      </div>

      <DataTable<DisplayEntry>
        columns={COLUMNS}
        data={entries}
        getRowId={entry => entry.id}
        loading={isLoading}
        emptyState={EMPTY_STATE}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search entries..." />
          </DataTableToolbar>
        )}
      />
    </div>
  );
};
