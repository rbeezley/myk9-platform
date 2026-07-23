import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList } from 'lucide-react';
import { getEntriesByShow } from '@/services/database/entries';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

interface EntriesTabProps {
  showId: string;
  onManageEntries?: (() => void) | undefined;
}

/**
 * Manager-only entries summary. Managers are always authenticated (canManageShow
 * requires secretary/admin), so this always resolves via `getEntriesByShow`
 * (the authenticated read) — there is no anonymous/public consumer of this
 * component; see ShowDetailTabs, its sole caller.
 *
 * Renders a slim total-entries count plus a single primary action that opens
 * the full Entry Management cockpit — no duplicate table (design D5).
 */
export const EntriesTab: React.FC<EntriesTabProps> = ({ showId, onManageEntries }) => {
  const {
    data: entries = [],
    isLoading: loading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: ['shows', showId, 'entries', 'auth'],
    queryFn: async () => {
      const result = await getEntriesByShow(showId);
      if (result.error) throw result.error;
      return result.data ?? [];
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
        <CardContent role="status" aria-label="Loading show entries" className="p-6">
          <TableSkeleton rows={2} columns={1} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
        <CardContent className="p-16 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <p className="text-destructive font-medium">Failed to load entries</p>
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
            {onManageEntries && <Button onClick={onManageEntries}>Open Entry Management</Button>}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-gradient-to-br from-gray-50/50 via-white to-slate-50/30 backdrop-blur-xl shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-2xl font-bold text-foreground">{entries.length}</div>
            <div className="text-sm text-muted-foreground">
              {entries.length === 1 ? 'entry' : 'entries'} across this show
            </div>
          </div>
          {onManageEntries && <Button onClick={onManageEntries}>Open Entry Management</Button>}
        </div>
      </CardContent>
    </Card>
  );
};
