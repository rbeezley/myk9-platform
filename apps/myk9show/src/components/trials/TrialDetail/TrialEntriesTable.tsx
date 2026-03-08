import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { getEntriesByTrial } from '@/services/database/queries/entry-query-lookups';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Loader2, ClipboardList } from 'lucide-react';
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

type SortField = 'dogName' | 'className' | 'handler' | 'status' | 'armband' | 'date';
type SortDirection = 'asc' | 'desc';

interface SortConfig {
  field: SortField;
  direction: SortDirection;
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

export const TrialEntriesTable = ({ trialId }: TrialEntriesTableProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);

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

  // Handle column sorting
  const handleSort = (field: SortField) => {
    let direction: SortDirection = 'asc';
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ field, direction });
  };

  // Filter and sort entries
  const filteredAndSortedEntries = useMemo(() => {
    let filtered = entries;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = entries.filter(
        entry =>
          entry.dogName.toLowerCase().includes(searchLower) ||
          entry.className.toLowerCase().includes(searchLower) ||
          entry.handler.toLowerCase().includes(searchLower) ||
          entry.status.toLowerCase().includes(searchLower) ||
          entry.armband.toLowerCase().includes(searchLower) ||
          entry.breed.toLowerCase().includes(searchLower)
      );
    }

    if (sortConfig) {
      filtered = [...filtered].sort((a, b) => {
        const { field, direction } = sortConfig;
        let aValue: string | number = a[field] ?? '';
        let bValue: string | number = b[field] ?? '';

        if (field === 'date') {
          aValue = a.rawDate ? new Date(a.rawDate).getTime() : 0;
          bValue = b.rawDate ? new Date(b.rawDate).getTime() : 0;
        }

        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [entries, searchTerm, sortConfig]);

  // Get sort icon for column header
  const getSortIcon = (field: SortField) => {
    if (!sortConfig || sortConfig.field !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="ml-2 h-4 w-4" />
    ) : (
      <ArrowDown className="ml-2 h-4 w-4" />
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading entries...</span>
      </div>
    );
  }

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

  if (entries.length === 0) {
    return (
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
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            Entries ({filteredAndSortedEntries.length}
            {searchTerm && filteredAndSortedEntries.length !== entries.length && (
              <span className="text-muted-foreground"> of {entries.length}</span>
            )}
            )
          </h3>
          <p className="text-sm text-muted-foreground">All entries registered for this trial</p>
        </div>
      </div>

      {/* Search Box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search entries by dog, class, handler, or armband..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-10 bg-card"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table className="bg-card text-foreground">
          <TableHeader>
            <TableRow className="bg-card hover:bg-card">
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('armband')}
              >
                <div className="flex items-center">
                  Armband
                  {getSortIcon('armband')}
                </div>
              </TableHead>
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('dogName')}
              >
                <div className="flex items-center">
                  Dog
                  {getSortIcon('dogName')}
                </div>
              </TableHead>
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('className')}
              >
                <div className="flex items-center">
                  Class
                  {getSortIcon('className')}
                </div>
              </TableHead>
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('handler')}
              >
                <div className="flex items-center">
                  Handler
                  {getSortIcon('handler')}
                </div>
              </TableHead>
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center">
                  Status
                  {getSortIcon('status')}
                </div>
              </TableHead>
              <TableHead
                className="font-semibold text-xs uppercase tracking-wider cursor-pointer hover:text-primary"
                onClick={() => handleSort('date')}
              >
                <div className="flex items-center">
                  Registered
                  {getSortIcon('date')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="text-muted-foreground">
                    {searchTerm
                      ? `No entries found matching "${searchTerm}"`
                      : 'No entries to display'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredAndSortedEntries.map(entry => (
                <TableRow key={entry.id} className="bg-card hover:bg-muted/50 transition-colors">
                  <TableCell className="font-mono">{entry.armband || '--'}</TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{entry.dogName}</div>
                      {entry.breed && (
                        <div className="text-xs text-muted-foreground">{entry.breed}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{entry.className}</TableCell>
                  <TableCell>{entry.handler}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-block px-3 py-1 text-xs font-semibold rounded-full capitalize ${getEntryStatusClasses(entry.status)}`}
                    >
                      {entry.status}
                    </span>
                  </TableCell>
                  <TableCell>{entry.date}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
