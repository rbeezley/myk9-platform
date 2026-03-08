import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Search, ClipboardList, Loader2 } from 'lucide-react';
import { getEntriesByShow } from '@/services/database/queries/entryQueries';

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

/** Status badge colors for entry statuses. */
function getStatusStyle(status: string | null): string {
  switch (status?.toLowerCase()) {
    case 'confirmed':
    case 'accepted':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'pending':
    case 'submitted':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'cancelled':
    case 'withdrawn':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'waitlisted':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

export const EntriesTab: React.FC<EntriesTabProps> = ({ showId, onManageEntries }) => {
  const [entries, setEntries] = useState<ShowEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchEntries() {
      setLoading(true);
      setError(null);

      const result = await getEntriesByShow(showId);

      if (cancelled) return;

      if (result.error) {
        setError(result.error.message || 'Failed to load entries');
        setEntries([]);
      } else {
        setEntries((result.data as ShowEntryRow[]) || []);
      }
      setLoading(false);
    }

    fetchEntries();
    return () => {
      cancelled = true;
    };
  }, [showId]);

  /** Filtered entries based on search term. */
  const filteredEntries = useMemo(() => {
    if (!searchTerm.trim()) return entries;
    const term = searchTerm.toLowerCase();
    return entries.filter(entry => {
      const dogName = (entry.dog?.call_name || entry.dog?.name || '').toLowerCase();
      const handler = (entry.handler || '').toLowerCase();
      const className = (entry.class?.name || '').toLowerCase();
      const armband = (entry.armband || '').toLowerCase();
      const ownerName = entry.dog?.owner
        ? `${entry.dog.owner.first_name || ''} ${entry.dog.owner.last_name || ''}`.toLowerCase()
        : '';
      return (
        dogName.includes(term) ||
        handler.includes(term) ||
        className.includes(term) ||
        armband.includes(term) ||
        ownerName.includes(term)
      );
    });
  }, [entries, searchTerm]);

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
      {/* Search and summary bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by dog, handler, class, or armband..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {filteredEntries.length} of {entries.length} entries
          </span>
          {onManageEntries && (
            <Button onClick={onManageEntries} variant="outline" size="sm">
              <Users className="w-4 h-4 mr-2" />
              Manage Entries
            </Button>
          )}
        </div>
      </div>

      {/* Entries table */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">Dog</th>
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">Class</th>
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">
                  Handler / Owner
                </th>
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">Armband</th>
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">Status</th>
                <th className="text-left font-semibold px-4 py-3 text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map(entry => {
                const dogDisplay = entry.dog?.call_name || entry.dog?.name || 'Unknown Dog';
                const breed = entry.dog?.breed || '';
                const className = entry.class?.name || 'N/A';
                const handlerDisplay =
                  entry.handler ||
                  (entry.dog?.owner
                    ? `${entry.dog.owner.first_name || ''} ${entry.dog.owner.last_name || ''}`.trim()
                    : 'N/A');
                const status = entry.entry_status || 'Unknown';
                const dateStr = entry.created_at
                  ? new Date(entry.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A';

                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{dogDisplay}</div>
                      {breed && <div className="text-xs text-muted-foreground">{breed}</div>}
                    </td>
                    <td className="px-4 py-3 text-foreground">{className}</td>
                    <td className="px-4 py-3 text-foreground">{handlerDisplay}</td>
                    <td className="px-4 py-3 text-foreground font-mono">{entry.armband || '-'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(status)}`}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{dateStr}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredEntries.length === 0 && searchTerm && (
          <div className="p-8 text-center text-muted-foreground">
            No entries match "{searchTerm}"
          </div>
        )}
      </Card>
    </div>
  );
};
