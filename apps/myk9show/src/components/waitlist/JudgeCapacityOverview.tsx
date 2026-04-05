import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { JudgeDayCapacity } from '@/types/waitlist-types';

interface JudgeCapacityOverviewProps {
  judgeDays: JudgeDayCapacity[];
  onViewWaitList: (judgeId: string, showDate: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function getBarColor(confirmedCount: number, capacity: number): string {
  const pct = capacity > 0 ? (confirmedCount / capacity) * 100 : 0;
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-400';
  return 'bg-green-500';
}

export function JudgeCapacityOverview({ judgeDays, onViewWaitList }: JudgeCapacityOverviewProps) {
  if (judgeDays.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No judge-day assignments found for this show.</p>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {judgeDays.map(day => {
        const fillPct =
          day.capacity > 0 ? Math.min(100, (day.confirmedCount / day.capacity) * 100) : 0;
        const barColor = getBarColor(day.confirmedCount, day.capacity);
        const isFull = day.availableSpots === 0;

        return (
          <Card key={`${day.judgeId}-${day.showDate}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight">{day.judgeName}</CardTitle>
                {isFull && (
                  <Badge variant="destructive" className="shrink-0">
                    Full
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{formatDate(day.showDate)}</p>
            </CardHeader>

            <CardContent className="space-y-3">
              <div>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">
                    {day.confirmedCount} / {day.capacity} entries
                  </span>
                  <span className="text-muted-foreground">
                    {day.availableSpots} spot{day.availableSpots !== 1 ? 's' : ''} available
                  </span>
                </div>
                <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${fillPct}%` }}
                    role="progressbar"
                    aria-valuenow={day.confirmedCount}
                    aria-valuemin={0}
                    aria-valuemax={day.capacity}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {day.waitlistCount > 0 && (
                  <Badge variant="secondary">{day.waitlistCount} on wait list</Badge>
                )}
                {day.mailInReserved > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {day.mailInReserved} mail-in reserved
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => onViewWaitList(day.judgeId, day.showDate)}
              >
                View Wait List
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
