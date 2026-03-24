import React from 'react';
import { Users, CheckCircle, Target, Clock } from 'lucide-react';
import { StatCard, StatsGrid } from '@myk9/ui';
import { EntryData } from './types/classTypes';

interface ClassStatisticsProps {
  classEntries: EntryData[];
}

const calcStats = (entries: EntryData[]) => {
  const total = entries.length;
  const qualified = entries.filter(e => e.status === 'Qualified');
  const notQualified = entries.filter(e => e.status === 'Not Qualified');
  const avgScore = entries.length
    ? (entries.reduce((sum, e) => sum + parseFloat(e.score), 0) / entries.length).toFixed(1)
    : '0';
  const avgTime = entries.length
    ? (
        entries.reduce((sum, e) => sum + (parseFloat(e.time.replace(':', '.')) || 0), 0) /
        entries.length
      ).toFixed(2)
    : '0';

  const qualificationRate = total ? (qualified.length / total) * 100 : 0;

  return {
    total,
    qualified: qualified.length,
    notQualified: notQualified.length,
    avgScore,
    avgTime,
    qualificationRate: qualificationRate.toFixed(0),
    qualificationProgress: Math.min(qualificationRate, 100),
  };
};

const ClassStatistics: React.FC<ClassStatisticsProps> = ({ classEntries }) => {
  const stats = calcStats(classEntries);

  return (
    <StatsGrid columns={4}>
      <StatCard
        icon={Users}
        title="Total Entries"
        value={stats.total}
        color="primary"
        subtitle={`${stats.qualified} qualified, ${stats.notQualified} NQ`}
        progress={stats.total > 0 ? Math.min((stats.total / 20) * 100, 100) : 0}
      />
      <StatCard
        icon={CheckCircle}
        title="Qualified"
        value={stats.qualified}
        color="emerald"
        subtitle={`${stats.qualificationRate}% rate`}
        progress={stats.qualificationProgress}
      />
      <StatCard
        icon={Target}
        title="Avg Score"
        value={stats.avgScore === '0' ? '--' : stats.avgScore}
        color="amber"
        subtitle="Out of 100 points"
        progress={stats.avgScore !== '0' ? parseFloat(stats.avgScore) : 0}
      />
      <StatCard
        icon={Clock}
        title="Avg Time"
        value={stats.avgTime === '0.00' ? '--' : `${stats.avgTime}s`}
        color="blue"
        subtitle="Average completion"
        progress={
          stats.avgTime !== '0.00' ? Math.min((parseFloat(stats.avgTime) / 180) * 100, 100) : 0
        }
      />
    </StatsGrid>
  );
};

export default ClassStatistics;
