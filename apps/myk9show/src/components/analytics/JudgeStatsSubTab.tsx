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

interface JudgeStatsSubTabProps {
  showId: string;
}

export function JudgeStatsSubTab({ showId }: JudgeStatsSubTabProps) {
  const { data: judges = [], isLoading: judgesLoading } = useShowJudges(showId);
  const [selectedJudgeId, setSelectedJudgeId] = useState<string | undefined>();

  // Derive effective judge ID — fall back to first judge if none explicitly selected
  const effectiveJudgeId = selectedJudgeId ?? judges[0]?.id;

  const { data: entries, isLoading: entriesLoading } = useJudgeShowStats(effectiveJudgeId, showId);

  const summary = useMemo(() => computeSummaryStats(entries || []), [entries]);
  const distribution = useMemo(() => computeResultDistribution(entries || []), [entries]);
  const dogStats = useMemo(() => computePerDogStats(entries || []), [entries]);
  const fastestTimes = useMemo(() => computeFastestTimes(entries || [], 10), [entries]);
  const classBreakdown = useMemo(() => computeClassBreakdown(entries || []), [entries]);

  const hasScoredEntries = summary.scoredEntries > 0;
  const isLoading = judgesLoading || entriesLoading;

  if (judgesLoading) {
    return <StatsSummaryCardsSkeleton />;
  }

  if (judges.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Scale className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-semibold text-foreground">No Judge Assignments</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Judge statistics will appear here once judges are assigned to classes.
        </p>
      </div>
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
            {classBreakdown.length} class{classBreakdown.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {isLoading && <StatsSummaryCardsSkeleton />}

      {!isLoading && !hasScoredEntries && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Scale className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <h3 className="text-base font-semibold text-foreground">No Scored Entries</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Statistics will appear once scoring begins for this judge&apos;s classes.
          </p>
        </div>
      )}

      {!isLoading && hasScoredEntries && (
        <>
          <StatsSummaryCards stats={summary} />
          <ClassBreakdownTable classes={classBreakdown} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResultDistributionChart data={distribution} />
            <DogBreakdownCards dogs={dogStats} />
          </div>
          {fastestTimes.length > 0 && (
            <FastestTimesTable times={fastestTimes} showShowColumn={false} />
          )}
        </>
      )}
    </div>
  );
}
