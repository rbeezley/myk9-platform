import { Card } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { useScheduleSummary } from '@/hooks/queries/useScheduleSummary';

function formatLevelRange(levels: string[]): string {
  if (levels.length <= 2) return levels.join(', ');
  return `${levels[0]}–${levels[levels.length - 1]}`;
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
          <div className="text-sm font-semibold text-primary mb-2 pb-1.5 border-b border-border/30">
            {formatDate(day.date + 'T00:00:00', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {day.disciplines.map(disc => (
            <div key={disc.name} className="flex justify-between items-baseline py-1.5 text-sm">
              <span className="font-medium text-foreground">{disc.name}</span>
              <span className="text-muted-foreground text-xs">
                {disc.name === 'Other'
                  ? disc.classNames.join(', ')
                  : [
                      disc.elements.length > 0 ? disc.elements.join(', ') : null,
                      disc.levels.length > 0 ? formatLevelRange(disc.levels) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            </div>
          ))}
        </div>
      ))}
    </Card>
  );
}
