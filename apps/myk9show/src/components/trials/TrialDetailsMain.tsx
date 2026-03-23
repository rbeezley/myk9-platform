import React from 'react';
import { Trial, TrialClass } from './types/trial.types';
import { TrialStatisticsData } from './TrialDetail/TrialStatistics';
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
      detail1: `Active: ${statistics.judges.active}`,
      detail2: `On Break: ${statistics.judges.onBreak}`,
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
      detail1: `Upcoming: ${statistics.classes.upcoming}`,
      detail2: `Completed: ${statistics.classes.completed}`,
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
      detail1: `Upcoming: ${statistics.entries.upcoming}`,
      detail2: `Completed: ${statistics.entries.completed}`,
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
            detail1: `Qualified: ${statistics.qualifiedRate.qualified}`,
            detail2: `Total: ${statistics.qualifiedRate.total}`,
            progress: statistics.qualifiedRate.percent,
            type: 'qualified',
          },
        ]
      : baseStats;

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="myk9-show-stats-section">
        <div className="myk9-show-stats-grid grid-cols-1 md:grid-cols-4">
          {stats.map((stat, index) => (
            <div key={index} className="myk9-show-stat-card">
              <div className="myk9-show-stat-layout">
                <div className={`myk9-show-stat-icon ${stat.type}`}>
                  {stat.type === 'judges' && <Gavel className="w-5 h-5" />}
                  {stat.type === 'classes' && <Trophy className="w-5 h-5" />}
                  {stat.type === 'entries' && <Users className="w-5 h-5" />}
                  {stat.type === 'qualified' && <Trophy className="w-5 h-5" />}
                </div>

                <div className="myk9-show-stat-content">
                  <div className="myk9-show-stat-header">
                    <div className="myk9-show-stat-title">{stat.title}</div>
                    <div className="myk9-show-stat-subtitle">{stat.subtitle}</div>
                  </div>
                  <div className="myk9-show-stat-number">{stat.value}</div>
                </div>
              </div>

              <div className="myk9-show-stat-details">
                <span>{stat.detail1}</span>
                <span>{stat.detail2}</span>
              </div>

              <div className="myk9-show-stat-progress">
                <div
                  className={`myk9-show-stat-progress-bar ${stat.type}`}
                  style={{ width: `${stat.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

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
