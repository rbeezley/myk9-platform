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

interface ShowStatsSubTabProps {
  showId: string;
}

export function ShowStatsSubTab({ showId }: ShowStatsSubTabProps) {
  const { data: entries, isLoading } = useShowStats(showId);

  const summary = useMemo(() => computeSummaryStats(entries || []), [entries]);
  const distribution = useMemo(() => computeResultDistribution(entries || []), [entries]);
  const dogStats = useMemo(() => computePerDogStats(entries || []), [entries]);
  const fastestTimes = useMemo(() => computeFastestTimes(entries || [], 10), [entries]);

  const hasScoredEntries = summary.scoredEntries > 0;

  if (isLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (!hasScoredEntries) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">No Scored Entries</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Show statistics will appear here once scoring begins.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatsSummaryCards stats={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultDistributionChart data={distribution} />
        <DogBreakdownCards dogs={dogStats} />
      </div>

      {fastestTimes.length > 0 && <FastestTimesTable times={fastestTimes} showShowColumn={false} />}
    </div>
  );
}
