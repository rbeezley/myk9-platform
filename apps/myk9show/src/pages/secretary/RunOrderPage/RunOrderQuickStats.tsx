import React from 'react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { LayoutGrid, Clock, Users, AlertTriangle, Calendar } from 'lucide-react';

interface ScheduleStats {
  totalDuration: number;
  judgeCount: number;
  totalConflicts: number;
  startTime: Date | null;
  endTime: Date | null;
}

interface RunOrderQuickStatsProps {
  classCount: number;
  stats: ScheduleStats;
}

export const RunOrderQuickStats: React.FC<RunOrderQuickStatsProps> = ({ classCount, stats }) => {
  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return '--';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const formatTime = (date: Date | null) => {
    return date ? date.toTimeString().slice(0, 5) : '--:--';
  };

  return (
    <StatsGrid columns={5} className="mb-6">
      <StatCard icon={LayoutGrid} title="Classes" value={classCount} color="blue" />
      <StatCard
        icon={Clock}
        title="Duration"
        value={formatDuration(stats.totalDuration)}
        color="emerald"
      />
      <StatCard icon={Users} title="Judges" value={stats.judgeCount} color="purple" />
      <StatCard
        icon={AlertTriangle}
        title="Conflicts"
        value={stats.totalConflicts}
        color={stats.totalConflicts > 0 ? 'red' : 'emerald'}
      />
      <StatCard
        icon={Calendar}
        title="Schedule"
        value={`${formatTime(stats.startTime)} - ${formatTime(stats.endTime)}`}
        color="primary"
      />
    </StatsGrid>
  );
};
