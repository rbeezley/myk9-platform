import React from 'react';
import { Users } from 'lucide-react';
import { StatCard, StatsGrid, StatusIcon } from '@myk9/ui';
import type { CheckInStatistics } from '@/types/offline-checkin-types';

interface StatisticsPanelProps {
  statistics: CheckInStatistics;
}

export const StatisticsPanel: React.FC<StatisticsPanelProps> = ({ statistics }) => {
  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={statistics.totalEntries}
        color="primary"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="checked-in" decorative />}
        title="Checked In"
        value={statistics.checkedInCount}
        color="emerald"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="pulled" decorative />}
        title="Pulled"
        value={statistics.scratchedCount}
        color="amber"
      />
      <StatCard
        icon={<StatusIcon family="entry" status="conflict" decorative />}
        title="Conflicts"
        value={statistics.conflictCount}
        color="red"
      />
    </StatsGrid>
  );
};
