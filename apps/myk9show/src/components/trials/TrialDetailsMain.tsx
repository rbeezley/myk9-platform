import React, { startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trial, TrialClass } from './types/trial.types';
import { TrialStatisticsData } from './TrialDetail/TrialStatistics';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Users, Trophy, Edit, Trash2, MoreVertical, Play, Check, Clock, Gavel, ChevronLeft, ChevronRight } from 'lucide-react';
import { TrialClassesTable } from './TrialDetail/TrialClassesTable';
import Breadcrumb from '@/components/common/Breadcrumb';
import { useBreadcrumb } from '@/hooks/useBreadcrumb';
import type { Show } from '@/types/show-types';
import '@/styles/apple-show-details.css';

interface TrialDetailsMainProps {
  trial: Trial & { classes?: TrialClass[] };
  statistics: TrialStatisticsData;
  parentShow?: { id: string; name: string; type: string } & Record<string, unknown> | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onAddClassesFromTemplate?: () => void;
  onEditClass: (classItem: TrialClass) => void;
  onDeleteClass: (classItem: TrialClass) => void;
  // Navigation props
  onPrevTrial?: () => void;
  onNextTrial?: () => void;
  prevTrialId?: string | null;
  nextTrialId?: string | null;
  currentTrialIndex?: number;
  totalTrials?: number;
}

const TrialDetailsMain: React.FC<TrialDetailsMainProps> = ({
  trial,
  statistics,
  parentShow,
  onEdit,
  onDelete,
  onAddClassesFromTemplate,
  onEditClass,
  onDeleteClass,
  onPrevTrial,
  onNextTrial,
  prevTrialId,
  nextTrialId,
  currentTrialIndex,
  totalTrials,
}) => {
  const navigate = useNavigate();
  
  // Generate breadcrumb items
  const breadcrumbItems = useBreadcrumb({
    currentPage: 'trial',
    show: parentShow as unknown as Show | undefined,
    trial: trial
  });
  const getStatusClass = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'upcoming': 
      case 'scheduled': 
        return 'apple-show-status-upcoming';
      case 'in progress': 
        return 'apple-show-status-in-progress';
      case 'completed': 
        return 'apple-show-status-completed';
      case 'cancelled':
        return 'apple-show-status-cancelled';
      default: 
        return 'apple-show-status-upcoming';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'upcoming':
      case 'scheduled': 
        return <Clock className="w-3 h-3" />;
      case 'in progress': 
        return <Play className="w-3 h-3" />;
      case 'completed': 
        return <Check className="w-3 h-3" />;
      default: 
        return <Clock className="w-3 h-3" />;
    }
  };

  // Build stats array with contextual subtitles (not misleading percent changes)
  const baseStats = [
    {
      title: "Judges",
      value: statistics.judges.total.toString(),
      subtitle: statistics.judges.active > 0
        ? `${statistics.judges.active} active`
        : "None active",
      detail1: `Active: ${statistics.judges.active}`,
      detail2: `On Break: ${statistics.judges.onBreak}`,
      progress: statistics.judges.total > 0 ? Math.round((statistics.judges.active / statistics.judges.total) * 100) : 0,
      type: "judges"
    },
    {
      title: "Total Classes",
      value: statistics.classes.total.toString(),
      subtitle: statistics.classes.total > 0
        ? `${statistics.classes.completed} of ${statistics.classes.total} completed`
        : "No classes",
      detail1: `Upcoming: ${statistics.classes.upcoming}`,
      detail2: `Completed: ${statistics.classes.completed}`,
      progress: statistics.classes.total > 0 ? Math.round((statistics.classes.completed / statistics.classes.total) * 100) : 0,
      type: "classes"
    },
    {
      title: "Total Entries",
      value: statistics.entries.total.toString(),
      subtitle: statistics.entries.total > 0
        ? `${statistics.entries.completed} scored`
        : "No entries",
      detail1: `Upcoming: ${statistics.entries.upcoming}`,
      detail2: `Completed: ${statistics.entries.completed}`,
      progress: statistics.entries.total > 0 ? Math.round((statistics.entries.completed / statistics.entries.total) * 100) : 0,
      type: "entries"
    },
  ];

  // Only show Qualified Rate when there are completed entries
  const stats = statistics.classes.completed > 0
    ? [
        ...baseStats,
        {
          title: "Qualified Rate",
          value: `${statistics.qualifiedRate.percent}%`,
          subtitle: `${statistics.qualifiedRate.qualified} of ${statistics.qualifiedRate.total} qualified`,
          detail1: `Qualified: ${statistics.qualifiedRate.qualified}`,
          detail2: `Total: ${statistics.qualifiedRate.total}`,
          progress: statistics.qualifiedRate.percent,
          type: "qualified"
        },
      ]
    : baseStats;

  return (
    <div className="apple-show-container">
      {/* Breadcrumb Navigation */}
      <Breadcrumb items={breadcrumbItems} showHomeIcon={true} className="mb-6" />

      {/* Trial Information Card */}
      <div className="apple-show-info-card">
        <div className="apple-show-info-header">
          <div>
            <div className="flex items-center gap-3">
              <div className="apple-show-info-title">{trial.type || 'Trial'}</div>
              <div className={`apple-show-status ${getStatusClass(trial.status)}`}>
                {getStatusIcon(trial.status)}
                {trial.status || 'Upcoming'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Trial Navigation */}
            {totalTrials && totalTrials > 1 && (
              <div className="flex items-center gap-1 mr-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPrevTrial}
                  disabled={!prevTrialId}
                  title="Previous Trial"
                  className="h-8 w-8 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground min-w-[4rem] text-center">
                  {(currentTrialIndex ?? 0) + 1} of {totalTrials}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onNextTrial}
                  disabled={!nextTrialId}
                  title="Next Trial"
                  className="h-8 w-8 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Visible Edit button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              title="Edit Trial"
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>

            {/* Dropdown for less common actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Trial
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={onDelete}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Trial
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        
        <div className="apple-show-info-grid">
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Trial Date</div>
            <div className="apple-show-info-value">{new Date(trial.trialDate).toLocaleDateString()}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Trial Number</div>
            <div className="apple-show-info-value">{trial.trialNumber}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Event Number</div>
            <div className="apple-show-info-value">{trial.eventNumber}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Show Name</div>
            <div className="apple-show-info-value">
              {trial.showId ? (
                <button
                  onClick={() => startTransition(() => navigate(`/shows/${trial.showId}`))}
                  className="text-inherit hover:text-blue-600 dark:hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-2"
                >
                  {parentShow?.name || trial.showName || 'Unknown Show'}
                </button>
              ) : (
                parentShow?.name || trial.showName || 'Unknown Show'
              )}
            </div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Planned Start</div>
            <div className="apple-show-info-value">{trial.plannedStartTime || 'TBD'}</div>
          </div>
          <div className="apple-show-info-item">
            <div className="apple-show-info-label">Total Classes</div>
            <div className="apple-show-info-value">{trial.classes?.length || 0}</div>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="apple-show-stats-section">
        <div className="apple-show-stats-grid grid-cols-1 md:grid-cols-4">
          {stats.map((stat, index) => (
            <div key={index} className="apple-show-stat-card">
              <div className="apple-show-stat-layout">
                <div className={`apple-show-stat-icon ${stat.type}`}>
                  {stat.type === 'judges' && <Gavel className="w-5 h-5" />}
                  {stat.type === 'classes' && <Trophy className="w-5 h-5" />}
                  {stat.type === 'entries' && <Users className="w-5 h-5" />}
                  {stat.type === 'qualified' && <Trophy className="w-5 h-5" />}
                </div>
                
                <div className="apple-show-stat-content">
                  <div className="apple-show-stat-header">
                    <div className="apple-show-stat-title">{stat.title}</div>
                    <div className="apple-show-stat-subtitle">{stat.subtitle}</div>
                  </div>
                  <div className="apple-show-stat-number">{stat.value}</div>
                </div>
              </div>
              
              <div className="apple-show-stat-details">
                <span>{stat.detail1}</span>
                <span>{stat.detail2}</span>
              </div>
              
              <div className="apple-show-stat-progress">
                <div 
                  className={`apple-show-stat-progress-bar ${stat.type}`}
                  style={{ width: `${stat.progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Classes Section */}
      <div className="apple-trials-section">
        <div className="apple-trials-header">
          <div className="apple-trials-title">
            <div className="apple-trials-icon">
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