import React from 'react';
import { BarChart3, Award, Clock, TrendingUp } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import type { PerformanceSummary, StatusBreakdown } from '@/services/performanceStatsEngine';

interface StatsSummaryCardsProps {
  summary: PerformanceSummary;
  overall: StatusBreakdown;
}

const StatsSummaryCards: React.FC<StatsSummaryCardsProps> = ({ summary, overall }) => {
  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={BarChart3}
        title="Total Entries"
        value={summary.totalCompetitions}
        color="blue"
      />
      <StatCard
        icon={Award}
        title="Q Rate"
        value={`${overall.qRate}%`}
        subtitle={`${overall.qualified} of ${overall.total}`}
        color="emerald"
      />
      <StatCard
        icon={Clock}
        title="Fastest Time"
        value={summary.fastestTime ? `${summary.fastestTime.seconds.toFixed(2)}s` : '\u2014'}
        {...(summary.fastestTime?.className ? { subtitle: summary.fastestTime.className } : {})}
        color="amber"
      />
      <StatCard
        icon={TrendingUp}
        title="Avg Time"
        value={summary.avgTime ? `${summary.avgTime.toFixed(2)}s` : '\u2014'}
        subtitle="Qualified runs"
        color="purple"
      />
    </StatsGrid>
  );
};

export default StatsSummaryCards;
