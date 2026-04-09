import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, ClipboardList, Loader2 } from 'lucide-react';
import { getEntriesByShow } from '@/services/database/queries/entryQueries';
import { getEntryStatusClasses, formatDate } from '@/utils/entryManagementUtils';
import { DataTable, type ColumnDef } from '@/components/ui/data-table';

/** Shape of a single entry row returned by getEntriesByShow. */
interface ShowEntryRow {
  id: string;
  entry_status: string | null;
  handler: string | null;
  armband: string | null;
  entry_fee: number | null;
  payment_status: string | null;
  created_at: string | null;
  dog: {
    id: string;
    name: string | null;
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
    class_number: number | null;
    entry_fee: number | null;
  } | null;
}

interface EntriesTabProps {
  showId: string;
  onManageEntries?: (() => void) | undefined;
}

const entryColumns: ColumnDef<ShowEntryRow, unknown>[] = [
  {
    id: 'dogName',
    accessorFn: row => {
      const dog = row.dog;
      const parts = [dog?.name, dog?.call_name, dog?.breed].filter(Boolean);
      return parts.join(' ') || 'Unknown Dog';
    },
    header: 'Dog',
    cell: ({ row }) => {
      const dog = row.original.dog;
      const registeredName = dog?.name || 'Unknown Dog';
      const callName = dog?.call_name;
      const breed = dog?.breed || '';
      return (
        <div>
          <div className="font-medium text-foreground">{registeredName}</div>
          {callName && callName !== registeredName && (
            <div className="text-xs text-muted-foreground">&ldquo;{callName}&rdquo;</div>
          )}
          {breed && <div className="text-xs text-muted-foreground">{breed}</div>}
        </div>
      );
    },
  },
  {
    id: 'className',
    accessorFn: row => row.class?.name || 'N/A',
    header: 'Class',
  },
  {
    id: 'handler',
    accessorFn: row =>
      row.handler ||
      (row.dog?.owner
        ? `${row.dog.owner.first_name || ''} ${row.dog.owner.last_name || ''}`.trim()
        : 'N/A'),
    header: 'Handler / Owner',
    meta: { responsiveHide: 'md' as const },
  },
  {
    accessorKey: 'armband',
    header: 'Armband',
    cell: ({ getValue }) => <span className="font-mono">{(getValue() as string) || '-'}</span>,
  },
  {
    accessorKey: 'entry_status',
    header: 'Status',
    cell: ({ getValue }) => {
      const status = (getValue() as string) || 'Unknown';
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getEntryStatusClasses(status)}`}
        >
          {status}
        </span>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    meta: { responsiveHide: 'sm' as const },
    cell: ({ getValue }) => formatDate(getValue() as string | null),
  },
];

export const EntriesTab: React.FC<EntriesTabProps> = ({ showId, onManageEntries }) => {
  const {
    data: entries = [],
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['shows', showId, 'entries'],
    queryFn: async () => {
      const result = await getEntriesByShow(showId);
      if (result.error) throw result.error;
      return (result.data as unknown as ShowEntryRow[]) || [];
    },
    enabled: !!showId,
    ...cacheStrategies.dynamic,
  });

  const error = isError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load entries'
    : null;

  if (loading) {
    return (
      <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
        <CardContent className="p-16 text-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading entries...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
        <CardContent className="p-16 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <p className="text-red-600 font-medium">Failed to load entries</p>
            <p className="text-muted-foreground text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
        <CardContent className="p-16 text-center">
          <div className="max-w-md mx-auto space-y-6">
            <div className="p-6 bg-gradient-to-br from-gray-100 to-slate-100 rounded-full w-fit mx-auto">
              <ClipboardList className="w-16 h-16 text-gray-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-gray-900">No Entries Yet</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                Entries will appear here once exhibitors register for this show.
              </p>
            </div>
            {onManageEntries && (
              <Button onClick={onManageEntries} variant="outline">
                <Users className="w-4 h-4 mr-2" />
                Manage Entries
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{entries.length} entries</span>
          {onManageEntries && (
            <Button onClick={onManageEntries} variant="outline" size="sm">
              <Users className="w-4 h-4 mr-2" />
              Manage Entries
            </Button>
          )}
        </div>
      </div>

      <DataTable tableId="showEntriesTab" columns={entryColumns} data={entries} />
    </div>
  );
};
