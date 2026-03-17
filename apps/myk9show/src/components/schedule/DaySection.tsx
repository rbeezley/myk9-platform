import type { DayTimelineData } from './schedule-timeline.types';
import { TrialSpine } from './TrialSpine';

interface DaySectionProps {
  day: DayTimelineData;
  showId: string;
}

export function DaySection({ day, showId }: DaySectionProps) {
  const formatted = new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-orange-500">{formatted}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {day.trials.map(trial => (
          <TrialSpine key={trial.trialId} trial={trial} showId={showId} />
        ))}
      </div>
    </div>
  );
}
