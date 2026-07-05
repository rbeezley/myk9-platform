import React from 'react';
import { AlertCircle, BarChart3 } from 'lucide-react';
import { usePerformanceStatistics } from '@/hooks/usePerformanceStatistics';
import StatsSummaryCards from './StatsSummaryCards';
import {
  ResultsDistributionChart,
  ElementBreakdownChart,
  JudgePerformanceChart,
  ProgressTimelineChart,
} from './charts';
import { Skeleton } from '@/components/common/SkeletonLoaders';

interface PerformanceStatisticsSectionProps {
  dogId: string;
}

const PerformanceStatisticsSection: React.FC<PerformanceStatisticsSectionProps> = ({ dogId }) => {
  const { stats, isLoading, isError } = usePerformanceStatistics(dogId);

  if (isLoading) {
    return (
      <div role="status" aria-label="Loading performance statistics" className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-background rounded-xl shadow-sm p-6 border flex flex-col items-center justify-center min-h-[200px] gap-2">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Failed to load performance statistics.</p>
      </div>
    );
  }

  if (!stats || stats.overall.total === 0) {
    return (
      <div className="bg-background rounded-xl shadow-sm p-6 border">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No scored results yet</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Statistics will appear here once your dog has scored results from competitions or manual
            entries.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StatsSummaryCards summary={stats.summary} overall={stats.overall} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResultsDistributionChart overall={stats.overall} />
        <ElementBreakdownChart byElement={stats.byElement} />
        <JudgePerformanceChart byJudge={stats.byJudge} />
        <ProgressTimelineChart timeline={stats.timeline} />
      </div>
    </div>
  );
};

export default PerformanceStatisticsSection;
