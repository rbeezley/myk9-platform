import React from 'react';
import { Trophy, ListChecks, Users } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';

interface ShowStatisticsProps {
  stats: {
    totalTrials: number;
    totalClasses: number;
    totalEntries: number;
    completedTrials: number;
    completedClasses: number;
    completedEntries: number;
  };
}

const ShowStatistics: React.FC<ShowStatisticsProps> = ({ stats }) => {
  return (
    <StatsGrid columns={3} className="mb-8">
      <StatCard
        icon={Trophy}
        title="Total Trials"
        value={stats.totalTrials}
        color="blue"
        subtitle={`Completed: ${stats.completedTrials}`}
      />
      <StatCard
        icon={ListChecks}
        title="Total Classes"
        value={stats.totalClasses}
        color="purple"
        subtitle={`Completed: ${stats.completedClasses}`}
      />
      <StatCard
        icon={Users}
        title="Total Entries"
        value={stats.totalEntries}
        color="primary"
        subtitle={`Completed: ${stats.completedEntries}`}
      />
    </StatsGrid>
  );
};

export default ShowStatistics;
