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
import { EmptyState } from '@/components/common/EmptyState';

const FASTEST_TIMES_LIMIT = 20;

interface ShowStatsSubTabProps {
  showId: string;
}

export function ShowStatsSubTab({ showId }: ShowStatsSubTabProps) {
  const { data: entries, isLoading } = useShowStats(showId);
  const { data: judges } = useShowJudges(showId);
  const { filters, setFilter, clearFilters } = useShowStatsFilters();

  const options = useMemo(
    () => deriveStatsFilterOptions(entries ?? [], new Map((judges ?? []).map(j => [j.id, j.name]))),
    [entries, judges]
  );

  const filtered = useMemo(() => applyStatsFilters(entries ?? [], filters), [entries, filters]);

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

  return (
    <div className="space-y-6">
      <ShowStatsFilterBar
        keys={SHOW_STATS_FILTER_KEYS}
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
