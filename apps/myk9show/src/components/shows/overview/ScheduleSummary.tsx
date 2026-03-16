import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { useScheduleSummary } from '@/hooks/queries/useScheduleSummary';
import type { DisciplineSummary, TrialSummary } from '@/utils/schedule-summary';

function formatLevelRange(levels: string[]): string {
  if (levels.length === 0) return '';
  if (levels.length <= 2) return levels.join(', ');
  return `${levels[0]}–${levels[levels.length - 1]}`;
}

function formatDisciplineDetail(disc: DisciplineSummary): string {
  if (disc.name === 'Other') {
    return disc.classNames.join(', ');
  }

  const parts: string[] = [];
  if (disc.elements.length > 0) parts.push(disc.elements.join(', '));
  if (disc.levels.length > 0) parts.push(formatLevelRange(disc.levels));

  if (parts.length === 0) return '';
  return `(${parts.join(' · ')})`;
}

function TrialBlock({ trial }: { trial: TrialSummary }) {
  return (
    <div className="space-y-1.5">
      {trial.trialNumber && (
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Trial {trial.trialNumber}
        </div>
      )}
      {trial.disciplines.map(disc => (
        <div key={disc.name} className="flex items-baseline gap-2 py-0.5 text-sm">
          <span className="font-medium text-foreground">{disc.name}</span>
          <span className="text-muted-foreground text-xs">{formatDisciplineDetail(disc)}</span>
        </div>
      ))}
    </div>
  );
}

interface ScheduleSummaryProps {
  showId: string;
}

export function ScheduleSummary({ showId }: ScheduleSummaryProps) {
  const { data: schedule } = useScheduleSummary(showId);

  if (!schedule || schedule.length === 0) return null;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold text-foreground mb-4">Schedule</h3>
      {schedule.map(day => (
        <div key={day.date} className="mb-5 last:mb-0">
          <div className="text-sm font-semibold text-primary mb-3 pb-1.5 border-b border-border/30">
            {formatDate(day.date + 'T00:00:00', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="space-y-3">
            {day.trials.map((trial, idx) => (
              <TrialBlock key={trial.trialNumber ?? idx} trial={trial} />
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
