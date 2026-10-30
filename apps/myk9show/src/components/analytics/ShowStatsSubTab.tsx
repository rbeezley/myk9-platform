import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useShowStats } from '@/hooks/queries/useShowStats';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useShowStatsFilters } from '@/hooks/useShowStatsFilters';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  hasWithheldResults,
  isScored,
} from './analytics-utils';
import { WithheldStatsNotice } from './WithheldStatsNotice';
import { StatsSummaryCards, StatsSummaryCardsSkeleton } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';
import { ShowStatsFilterBar } from './ShowStatsFilterBar';
import { BreedPerformanceChart } from './BreedPerformanceChart';
import {
  applyStatsFilters,
  computeBreedPerformance,
  deriveStatsFilterOptions,
  hasActiveFilters,
  SHOW_STATS_FILTER_KEYS,
} from './analytics-filters';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';

const FASTEST_TIMES_LIMIT = 20;

interface ShowStatsSubTabProps {
  showId: string;
}

export function ShowStatsSubTab({ showId }: ShowStatsSubTabProps) {
  const { data: entries, isLoading, judgeLookupFailed, refetch } = useShowStats(showId);
  const { data: judges } = useShowJudges(showId);
  const { filters, setFilter, clearFilters } = useShowStatsFilters();

  const options = useMemo(
    () => deriveStatsFilterOptions(entries ?? [], new Map((judges ?? []).map(j => [j.id, j.name]))),
    [entries, judges]
  );

  // With no judge attribution a leftover ?judge= would hide every entry, so ignore it.
  const filtered = useMemo(
    () =>
      applyStatsFilters(entries ?? [], judgeLookupFailed ? { ...filters, judge: null } : filters),
    [entries, filters, judgeLookupFailed]
  );

  const stats = useMemo(
    () => ({
      summary: computeSummaryStats(filtered),
      distribution: computeResultDistribution(filtered),
      dogStats: computePerDogStats(filtered),
      breeds: computeBreedPerformance(filtered),
      fastestTimes: computeFastestTimes(filtered, FASTEST_TIMES_LIMIT),
    }),
    [filtered]
  );

  if (isLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (hasWithheldResults(entries ?? [])) {
    return <WithheldStatsNotice />;
  }

  // The withheld gate above ran on every entry; only now is it safe to narrow.
  if (!(entries ?? []).some(isScored)) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Scored Entries"
        description="Show statistics will appear here once scoring begins."
        action={null}
      />
    );
  }

  const filterKeys = judgeLookupFailed
    ? SHOW_STATS_FILTER_KEYS.filter(key => key !== 'judge')
    : SHOW_STATS_FILTER_KEYS;

  return (
    <div className="space-y-6">
      {judgeLookupFailed && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Judge filter unavailable, try again.
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </p>
      )}
      <ShowStatsFilterBar
        keys={filterKeys}
        filters={filters}
        options={options}
        onChange={setFilter}
        onClearAll={() => clearFilters()}
      />

      {stats.summary.scoredEntries === 0 && hasActiveFilters(filters) ? (
        <EmptyState
          icon={BarChart3}
          title="No scored entries match"
          description="Try removing a filter."
          action={{ label: 'Clear filters', onClick: () => clearFilters() }}
        />
      ) : (
        <>
          <StatsSummaryCards stats={stats.summary} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={stats.distribution} />
            <DogBreakdownCards dogs={stats.dogStats} />
          </div>

          <BreedPerformanceChart data={stats.breeds} />

          {stats.fastestTimes.length > 0 && (
            <FastestTimesTable times={stats.fastestTimes} showShowColumn={false} />
          )}
        </>
      )}
    </div>
  );
}
