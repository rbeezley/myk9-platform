import { useState, useMemo } from 'react';
import { Scale } from 'lucide-react';
import { useShowJudges } from '@/hooks/queries/useShowJudges';
import { useJudgeShowStats } from '@/hooks/queries/useJudgeShowStats';
import {
  computeSummaryStats,
  computePerDogStats,
  computeResultDistribution,
  computeFastestTimes,
  computeClassBreakdown,
} from './analytics-utils';
import { StatsSummaryCards, StatsSummaryCardsSkeleton } from './StatsSummaryCards';
import { ResultDistributionChart } from './ResultDistributionChart';
import { DogBreakdownCards } from './DogBreakdownCards';
import { FastestTimesTable } from './FastestTimesTable';
import { ClassBreakdownTable } from './ClassBreakdownTable';
import { EmptyState } from '@/components/common/EmptyState';

interface JudgeStatsSubTabProps {
  showId: string;
}

export function JudgeStatsSubTab({ showId }: JudgeStatsSubTabProps) {
  const { data: judges = [], isLoading: judgesLoading } = useShowJudges(showId);
  const [selectedJudgeId, setSelectedJudgeId] = useState<string | undefined>();

  const effectiveJudgeId = selectedJudgeId ?? judges[0]?.id;

  const { data: entries, isLoading: entriesLoading } = useJudgeShowStats(effectiveJudgeId, showId);

  const stats = useMemo(() => {
    const e = entries || [];
    return {
      summary: computeSummaryStats(e),
      distribution: computeResultDistribution(e),
      dogStats: computePerDogStats(e),
      fastestTimes: computeFastestTimes(e, 10),
      classBreakdown: computeClassBreakdown(e),
    };
  }, [entries]);

  const isLoading = judgesLoading || entriesLoading;

  if (judgesLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (judges.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="No Judge Assignments"
        description="Judge statistics will appear here once judges are assigned to classes."
      />
    );
  }

  const selectedJudge = judges.find(j => j.id === effectiveJudgeId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <select
          value={effectiveJudgeId || ''}
          onChange={e => setSelectedJudgeId(e.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm font-medium"
          aria-label="Select judge"
        >
          {judges.map(judge => (
            <option key={judge.id} value={judge.id}>
              {judge.name}
            </option>
          ))}
        </select>
        {selectedJudge && (
          <span className="text-sm text-muted-foreground">
            {stats.classBreakdown.length} class
            {stats.classBreakdown.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {isLoading && <StatsSummaryCardsSkeleton />}

      {!isLoading && stats.summary.scoredEntries === 0 && (
        <EmptyState
          icon={Scale}
          title="No Scored Entries"
          description="Statistics will appear once scoring begins for this judge's classes."
          size="sm"
        />
      )}

      {!isLoading && stats.summary.scoredEntries > 0 && (
        <>
          <StatsSummaryCards stats={stats.summary} />
          <ClassBreakdownTable classes={stats.classBreakdown} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={stats.distribution} />
            <DogBreakdownCards dogs={stats.dogStats} />
          </div>
          {stats.fastestTimes.length > 0 && (
            <FastestTimesTable times={stats.fastestTimes} showShowColumn={false} />
          )}
        </>
      )}
    </div>
  );
}
