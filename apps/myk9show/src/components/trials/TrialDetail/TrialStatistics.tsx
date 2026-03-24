import React from 'react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { Users, ClipboardList, ListChecks, Medal } from 'lucide-react';

export interface TrialStatisticsData {
  judges: {
    total: number;
    active: number;
    onBreak: number;
    percentChange: number;
  };
  classes: {
    total: number;
    upcoming: number;
    completed: number;
    percentChange: number;
  };
  entries: {
    total: number;
    upcoming: number;
    completed: number;
    percentChange: number;
  };
  qualifiedRate: {
    percent: number;
    qualified: number;
    total: number;
    percentChange: number;
  };
}

interface TrialStatisticsProps {
  data: TrialStatisticsData;
}

function formatTrend(percentChange: number): string {
  return percentChange > 0 ? `+${percentChange}%` : `${percentChange}%`;
}

const TrialStatistics: React.FC<TrialStatisticsProps> = ({ data }) => {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold mb-4 text-foreground">Trial Statistics</h2>
      <StatsGrid columns={4}>
        <StatCard
          icon={Users}
          title="Judges"
          value={data.judges.total}
          color="primary"
          subtitle={`Active: ${data.judges.active} · On Break: ${data.judges.onBreak}`}
          trend={formatTrend(data.judges.percentChange)}
        />
        <StatCard
          icon={ClipboardList}
          title="Total Classes"
          value={data.classes.total}
          color="purple"
          subtitle={`Upcoming: ${data.classes.upcoming} · Completed: ${data.classes.completed}`}
          progress={
            data.classes.total > 0
              ? Math.round((data.classes.completed / data.classes.total) * 100)
              : 0
          }
          trend={formatTrend(data.classes.percentChange)}
        />
        <StatCard
          icon={ListChecks}
          title="Total Entries"
          value={data.entries.total}
          color="primary"
          subtitle={`Upcoming: ${data.entries.upcoming} · Completed: ${data.entries.completed}`}
          progress={
            data.entries.total > 0
              ? Math.round((data.entries.completed / data.entries.total) * 100)
              : 0
          }
          trend={formatTrend(data.entries.percentChange)}
        />
        <StatCard
          icon={Medal}
          title="Qualified Rate"
          value={`${data.qualifiedRate.percent}%`}
          color="emerald"
          subtitle={`Qualified: ${data.qualifiedRate.qualified} · Total: ${data.qualifiedRate.total}`}
          progress={data.qualifiedRate.percent}
          trend={formatTrend(data.qualifiedRate.percentChange)}
        />
      </StatsGrid>
    </section>
  );
};

export default TrialStatistics;
