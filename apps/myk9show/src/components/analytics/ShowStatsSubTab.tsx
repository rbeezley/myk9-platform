import { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import { useShowStats } from '@/hooks/queries/useShowStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
} from './analytics-utils';
import { StatsSummaryCards, StatsSummaryCardsSkeleton } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';
import { EmptyState } from '@/components/common/EmptyState';

interface ShowStatsSubTabProps {
  showId: string;
}

export function ShowStatsSubTab({ showId }: ShowStatsSubTabProps) {
  const { data: entries, isLoading } = useShowStats(showId);

  const stats = useMemo(() => {
    const e = entries || [];
    return {
      summary: computeSummaryStats(e),
      distribution: computeResultDistribution(e),
      dogStats: computePerDogStats(e),
      fastestTimes: computeFastestTimes(e, 10),
    };
  }, [entries]);

  if (isLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (stats.summary.scoredEntries === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No Scored Entries"
        description="Show statistics will appear here once scoring begins."
      />
    );
  }

  return (
    <div className="space-y-6">
      <StatsSummaryCards stats={stats.summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultDistributionChart data={stats.distribution} />
        <DogBreakdownCards dogs={stats.dogStats} />
      </div>

      {stats.fastestTimes.length > 0 && (
        <FastestTimesTable times={stats.fastestTimes} showShowColumn={false} />
      )}
    </div>
  );
}
