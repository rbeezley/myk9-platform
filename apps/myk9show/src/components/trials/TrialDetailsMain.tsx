import React from 'react';
import { Trial, TrialClass } from './types/trial.types';
import { TrialStatisticsData } from './TrialDetail/TrialStatistics';
import { StatCard, StatsGrid, type StatColor } from '@myk9/ui';
import type { LucideIcon } from 'lucide-react';
import { Users, Trophy, Gavel } from 'lucide-react';
import { TrialClassesTable } from './TrialDetail/TrialClassesTable';
import { TrialTimeline } from '@/components/schedule';
import '@/styles/myk9-show-details.css';

interface TrialDetailsMainProps {
  trial: Trial & { classes?: TrialClass[] };
  statistics: TrialStatisticsData;
  onAddClassesFromTemplate?: () => void;
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
}

const STAT_CONFIG: Record<string, { icon: LucideIcon; color: StatColor }> = {
  judges: { icon: Gavel, color: 'amber' },
  classes: { icon: Trophy, color: 'purple' },
  entries: { icon: Users, color: 'primary' },
  qualified: { icon: Trophy, color: 'emerald' },
};

const TrialDetailsMain: React.FC<TrialDetailsMainProps> = ({
  trial,
  statistics,
  onAddClassesFromTemplate,
  onEditClass,
  onDeleteClass,
}) => {
  // Build stats array with contextual subtitles
  const baseStats = [
    {
      title: 'Judges',
      value: statistics.judges.total.toString(),
      subtitle: statistics.judges.active > 0 ? `${statistics.judges.active} active` : 'None active',
      progress:
        statistics.judges.total > 0
          ? Math.round((statistics.judges.active / statistics.judges.total) * 100)
          : 0,
      type: 'judges',
    },
    {
      title: 'Total Classes',
      value: statistics.classes.total.toString(),
      subtitle:
        statistics.classes.total > 0
          ? `${statistics.classes.completed} of ${statistics.classes.total} completed`
          : 'No classes',
      progress:
        statistics.classes.total > 0
          ? Math.round((statistics.classes.completed / statistics.classes.total) * 100)
          : 0,
      type: 'classes',
    },
    {
      title: 'Total Entries',
      value: statistics.entries.total.toString(),
      subtitle:
        statistics.entries.total > 0 ? `${statistics.entries.completed} scored` : 'No entries',
      progress:
        statistics.entries.total > 0
          ? Math.round((statistics.entries.completed / statistics.entries.total) * 100)
          : 0,
      type: 'entries',
    },
  ];

  // Only show Qualified Rate when there are completed entries
  const stats =
    statistics.classes.completed > 0
      ? [
          ...baseStats,
          {
            title: 'Qualified Rate',
            value: `${statistics.qualifiedRate.percent}%`,
            subtitle: `${statistics.qualifiedRate.qualified} of ${statistics.qualifiedRate.total} qualified`,
            progress: statistics.qualifiedRate.percent,
            type: 'qualified',
          },
        ]
      : baseStats;

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <StatsGrid columns={4}>
        {stats.map((stat, index) => {
          const config = STAT_CONFIG[stat.type];
          return (
            <StatCard
              key={index}
              icon={config.icon}
              title={stat.title}
              value={stat.value}
              color={config.color}
              subtitle={stat.subtitle}
              progress={stat.progress}
            />
          );
        })}
      </StatsGrid>

      {/* Timeline */}
      <div>
        <h3 className="mb-3 text-base font-semibold">Timeline</h3>
        <TrialTimeline trialId={trial.id} showId={trial.showId} />
      </div>

      {/* Classes Section */}
      <div className="myk9-trials-section">
        <div className="myk9-trials-header">
          <div className="myk9-trials-title">
            <div className="myk9-trials-icon">
              <Trophy className="w-4 h-4" />
            </div>
            Classes
          </div>
        </div>

        <TrialClassesTable
          classes={trial.classes || []}
          trialId={trial.id}
          {...(onAddClassesFromTemplate !== undefined && { onAddClassesFromTemplate })}
          onEditClass={onEditClass}
          onDeleteClass={onDeleteClass}
        />
      </div>
    </div>
  );
};

export default TrialDetailsMain;
