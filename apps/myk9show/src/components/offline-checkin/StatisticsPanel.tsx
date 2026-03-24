import React from 'react';
import { Users, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
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
        icon={CheckCircle}
        title="Checked In"
        value={statistics.checkedInCount}
        color="emerald"
      />
      <StatCard icon={XCircle} title="Scratched" value={statistics.scratchedCount} color="amber" />
      <StatCard
        icon={AlertTriangle}
        title="Conflicts"
        value={statistics.conflictCount}
        color="red"
      />
    </StatsGrid>
  );
};
