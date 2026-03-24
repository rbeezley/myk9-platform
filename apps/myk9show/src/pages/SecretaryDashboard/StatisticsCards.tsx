/**
 * Statistics cards section for SecretaryDashboard
 */

import React from 'react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { ClipboardList, Users, Target, Timer } from 'lucide-react';
import type { DashboardStatistics } from './secretary-dashboard-types';

interface StatisticsCardsProps {
  statistics: DashboardStatistics;
  totalTrialsCount: number;
}

export const StatisticsCards: React.FC<StatisticsCardsProps> = ({
  statistics,
  totalTrialsCount,
}) => {
  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={ClipboardList}
        title="Active Trials"
        value={statistics.activeTrials}
        color="primary"
        subtitle={
          statistics.activeTrials > 0
            ? `${statistics.activeTrials} in progress`
            : 'No active trials'
        }
        {...(totalTrialsCount > 0 && {
          progress: (statistics.activeTrials / totalTrialsCount) * 100,
        })}
      />
      <StatCard
        icon={Users}
        title="Total Entries"
        value={statistics.totalEntries}
        color="blue"
        subtitle={
          statistics.totalEntries > 0
            ? `${statistics.totalEntries} total entries`
            : 'No entries yet'
        }
      />
      <StatCard
        icon={Target}
        title="Results Published"
        value={`${statistics.resultsPublished}%`}
        color="emerald"
        subtitle={
          statistics.totalEntries > 0
            ? `${statistics.resultsPublished}% completed`
            : 'No results to publish'
        }
        {...(statistics.totalEntries > 0 && { progress: statistics.resultsPublished })}
      />
      <StatCard
        icon={Timer}
        title="Avg. Processing"
        value={`${statistics.avgProcessing}m`}
        color="purple"
        subtitle={statistics.avgProcessing > 0 ? 'Per class average' : 'No data available'}
      />
    </StatsGrid>
  );
};
