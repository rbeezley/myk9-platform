import { Award, Clock, ClipboardList, Timer } from 'lucide-react';

import { StatCard, StatCardSkeleton } from '@myk9/ui';
import { StatsGrid } from '@myk9/ui';

import type { SummaryStats } from './analytics-utils';
import { formatTime } from './analytics-formatting';

interface StatsSummaryCardsProps {
  stats: SummaryStats;
}

export function StatsSummaryCards({ stats }: StatsSummaryCardsProps) {
  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={ClipboardList}
        title="Entries"
        value={stats.totalEntries}
        subtitle={`${stats.scoredEntries} of ${stats.totalEntries} scored`}
        color="primary"
      />
      <StatCard
        icon={Award}
        title="Q Rate"
        value={`${stats.qualificationRate}%`}
        subtitle={`${stats.qualifiedCount} of ${stats.scoredEntries} qualified`}
        progress={stats.qualificationRate}
        color="emerald"
      />
      <StatCard
        icon={Timer}
        title="Best Time"
        value={formatTime(stats.bestTime)}
        subtitle={stats.bestTimeDogName || undefined}
        color="amber"
      />
      <StatCard
        icon={Clock}
        title="Avg Time"
        value={formatTime(stats.avgTime)}
        subtitle={
          stats.medianTime != null ? 'Median: ' + formatTime(stats.medianTime) : undefined
        }
        color="primary"
      />
    </StatsGrid>
  );
}

export function StatsSummaryCardsSkeleton() {
  return (
    <StatsGrid columns={4}>
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
      <StatCardSkeleton />
    </StatsGrid>
  );
}
