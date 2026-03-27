import { useMemo } from 'react';
import { useTrialEntries } from '@/hooks/queries/useTrialEntries';
import { type ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
  DataTableColumnToggle,
} from '@/components/ui/data-table';
import { ClipboardList } from 'lucide-react';
import { getEntryStatusClasses } from '@/utils/entryManagementUtils';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { CheckInStatusBadge } from '@/components/common/CheckInStatusBadge';
import type { CheckInStatus } from '@myk9/core';

interface TrialEntriesTableProps {
  trialId: string;
}

interface DisplayEntry {
  id: string;
  dogName: string;
  breed: string;
  className: string;
  handler: string;
  status: string;
  checkInStatus: CheckInStatus;
  armband: string;
  date: string;
  rawDate: string;
}

const COLUMNS: ColumnDef<DisplayEntry, unknown>[] = [
  {
    accessorKey: 'armband',
    header: 'Armband',
    cell: ({ row }) => <ArmbandBadge armband={row.original.armband} />,
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
    id: 'checkInStatus',
    header: 'Check-in',
    cell: ({ row }) => (
      <CheckInStatusBadge status={row.original.checkInStatus} size="sm" />
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
  const { data: rawEntries = [], isLoading, isError } = useTrialEntries(trialId);

  // Map raw entries to display format
  const entries: DisplayEntry[] = useMemo(() => {
    return rawEntries.map(e => {
      const dog = e.dog;
      const owner = dog?.owner;

      const handlerName =
        e.handler || (owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : '');

      return {
        id: e.id,
        dogName: dog?.call_name || dog?.name || 'Unknown',
        breed: dog?.breed || '',
        className: e.class?.name || 'Unknown',
        handler: handlerName || 'Unknown',
        status: e.entry_status || 'pending',
        checkInStatus: (e.check_in_status as CheckInStatus) ?? 'no-status',
        armband: e.armband || '',
        date: e.created_at ? new Date(e.created_at).toLocaleDateString() : '',
        rawDate: e.created_at || '',
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
        tableId="trialEntries"
        columns={COLUMNS}
        data={entries}
        getRowId={entry => entry.id}
        loading={isLoading}
        emptyState={EMPTY_STATE}
        toolbar={({ table }) => (
          <DataTableToolbar table={table}>
            <DataTableSearch placeholder="Search entries..." />
            <DataTableColumnToggle />
          </DataTableToolbar>
        )}
      />
    </div>
  );
};
