import { useState, useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useShowStore } from '@/store/showStore';
import { useTrialStore } from '@/store/trialStore';
import { useCheckInReport } from '@/hooks/queries/useCheckInReport';
import { useShowCheckInSubscription } from '@/hooks/useShowCheckInSubscription';
import { CheckInProgressBar } from '@/components/checkin/CheckInProgressBar';
import { CheckInExhibitorCard } from '@/components/checkin/CheckInExhibitorCard';
import { SearchBar } from '@/components/common/SearchBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys } from '@/lib/queryClient';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@/lib/notifications';
import { DAY_ABBREVS, type ExhibitorCheckInGroup } from '@/hooks/queries/useCheckInReport';

type StatusFilter = 'needs-action' | 'done' | 'all';

export default function CheckInReportPage() {
  const { selectedShowId, shows } = useShowStore();
  const { trials } = useTrialStore();
  const queryClient = useQueryClient();

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const showTrials = trials.filter(t => t.showId === selectedShowId);

  const { data: groups = [], isLoading } = useCheckInReport(selectedShowId || undefined);
  useShowCheckInSubscription(selectedShowId || undefined);

  const [search, setSearch] = useState('');
  const [trialFilter, setTrialFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('needs-action');
  const [secretaryCheckedIds, setSecretaryCheckedIds] = useState<Set<string>>(new Set());

  const filteredGroups = useMemo(() => {
    let result = groups;

    if (trialFilter !== 'all') {
      result = result
        .map(g => ({
          ...g,
          entries: g.entries.filter(e => e.trialId === trialFilter),
        }))
        .filter(g => g.entries.length > 0)
        .map(g => {
          const checkedInCount = g.entries.filter(
            e => e.checkInStatus !== 'no-status' && !!e.checkInStatus
          ).length;
          const totalEntries = g.entries.length;
          const statuses = g.entries.map(e => e.checkInStatus);
          const hasNone = statuses.some(s => s === 'no-status' || !s);
          const hasCheckedIn = statuses.some(s => s !== 'no-status' && !!s);
          const summaryStatus: 'none' | 'partial' | 'checked-in' =
            hasNone && hasCheckedIn ? 'partial' : hasCheckedIn ? 'checked-in' : 'none';
          return { ...g, checkedInCount, totalEntries, summaryStatus };
        });
    }

    if (statusFilter === 'needs-action') {
      result = result.filter(g => g.summaryStatus !== 'checked-in');
    } else if (statusFilter === 'done') {
      result = result.filter(g => g.summaryStatus === 'checked-in');
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        g =>
          g.handlerName.toLowerCase().includes(q) ||
          g.dogName.toLowerCase().includes(q) ||
          String(g.armbandNumber).includes(q)
      );
    }

    const statusOrder = { none: 0, partial: 1, 'checked-in': 2 };
    return result.sort(
      (a, b) =>
        statusOrder[a.summaryStatus] - statusOrder[b.summaryStatus] ||
        a.armbandNumber - b.armbandNumber
    );
  }, [groups, trialFilter, statusFilter, search]);

  const counts = useMemo(() => {
    const needsAction = groups.filter(g => g.summaryStatus !== 'checked-in').length;
    const done = groups.filter(g => g.summaryStatus === 'checked-in').length;
    return { needsAction, done, all: groups.length };
  }, [groups]);

  const progressCounts = useMemo(() => {
    const checkedIn = groups
      .filter(g => g.summaryStatus === 'checked-in')
      .reduce((sum, g) => sum + g.totalEntries, 0);
    const partial = groups
      .filter(g => g.summaryStatus === 'partial')
      .reduce((sum, g) => sum + g.totalEntries, 0);
    const none = groups
      .filter(g => g.summaryStatus === 'none')
      .reduce((sum, g) => sum + g.totalEntries, 0);
    const total = groups.reduce((sum, g) => sum + g.totalEntries, 0);
    return { checkedIn, partial, none, total };
  }, [groups]);

  const handleCheckIn = async (entryId: string) => {
    if (!selectedShowId) return;
    const previousData = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId)
    );
    queryClient.setQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId),
      old =>
        old?.map(g => {
          const hasMatch = g.entries.some(e => e.entryId === entryId);
          if (!hasMatch) return g;
          const updatedEntries = g.entries.map(e =>
            e.entryId === entryId ? { ...e, checkInStatus: 'checked-in' } : e
          );
          const checkedInCount = updatedEntries.filter(
            e => e.checkInStatus !== 'no-status' && !!e.checkInStatus
          ).length;
          const allCheckedIn = checkedInCount === updatedEntries.length;
          const noneCheckedIn = checkedInCount === 0;
          return {
            ...g,
            entries: updatedEntries,
            checkedInCount,
            summaryStatus: allCheckedIn ? 'checked-in' : noneCheckedIn ? 'none' : 'partial',
          };
        })
    );

    const { error } = await supabase
      .from('entries')
      .update({ check_in_status: 'checked-in' } as Record<string, unknown>)
      .eq('id', entryId);

    if (error) {
      queryClient.setQueryData(queryKeys.checkInReport(selectedShowId), previousData);
      notifications.error('Failed to check in entry');
    } else {
      setSecretaryCheckedIds(prev => new Set(prev).add(entryId));
      queryClient.invalidateQueries({
        queryKey: queryKeys.checkInReport(selectedShowId),
      });
    }
  };

  const handleCheckInAll = async (entryIds: string[]) => {
    if (!selectedShowId) return;
    const entryIdSet = new Set(entryIds);
    const previousData = queryClient.getQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId)
    );
    queryClient.setQueryData<ExhibitorCheckInGroup[]>(
      queryKeys.checkInReport(selectedShowId),
      old =>
        old?.map(g => {
          const hasMatch = g.entries.some(e => entryIdSet.has(e.entryId));
          if (!hasMatch) return g;
          return {
            ...g,
            entries: g.entries.map(e =>
              entryIdSet.has(e.entryId) ? { ...e, checkInStatus: 'checked-in' } : e
            ),
            checkedInCount: g.entries.length,
            summaryStatus: 'checked-in' as const,
          };
        })
    );

    const { error } = await supabase
      .from('entries')
      .update({ check_in_status: 'checked-in' } as Record<string, unknown>)
      .in('id', entryIds);

    if (error) {
      queryClient.setQueryData(queryKeys.checkInReport(selectedShowId), previousData);
      notifications.error('Failed to check in entries');
    } else {
      setSecretaryCheckedIds(prev => {
        const next = new Set(prev);
        entryIds.forEach(id => next.add(id));
        return next;
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.checkInReport(selectedShowId),
      });
    }
  };

  if (!selectedShowId) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ClipboardCheck className="mb-4 h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">Select a show to view check-in status.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Check-In</h1>
          {selectedShow && <p className="text-sm text-muted-foreground">{selectedShow.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-xl" />
      ) : (
        <CheckInProgressBar
          checkedInCount={progressCounts.checkedIn}
          partialCount={progressCounts.partial}
          noneCount={progressCounts.none}
          totalEntries={progressCounts.total}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name or armband..."
          />
        </div>

        <Select value={trialFilter} onValueChange={setTrialFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All Trials" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Trials</SelectItem>
            {showTrials.map(trial => {
              const day = new Date(trial.trialDate + 'T00:00:00');
              const label = `${DAY_ABBREVS[day.getDay()]} T${trial.trialNumber}`;
              return (
                <SelectItem key={trial.id} value={trial.id}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="flex overflow-hidden rounded-lg border border-border">
          {(['needs-action', 'done', 'all'] as const).map(filter => (
            <button
              key={filter}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === 'needs-action' && `Needs Action \u00b7 ${counts.needsAction}`}
              {filter === 'done' && `Done \u00b7 ${counts.done}`}
              {filter === 'all' && `All \u00b7 ${counts.all}`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {groups.length === 0
            ? 'No entries found for this show.'
            : 'No results match your filters.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredGroups.map(group => (
            <CheckInExhibitorCard
              key={group.key}
              group={group}
              onCheckIn={handleCheckIn}
              onCheckInAll={handleCheckInAll}
              secretaryCheckedIds={secretaryCheckedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
