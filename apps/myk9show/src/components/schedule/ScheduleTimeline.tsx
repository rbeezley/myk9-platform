import { useScheduleTimeline } from '@/hooks/queries/useScheduleTimeline';
import { Card } from '@/components/ui/card';
import { DaySection } from './DaySection';

// Reserve vertical space while the schedule query is in flight so the rest
// of the show detail page (the panels rendered below it) doesn't get pushed
// down once the timeline expands. The loaded state grows with the number of
// trial days; ~420px covers a typical two-day weekend trial header + a
// handful of element rows without leaving large gaps on the common case.
// INTENT: prevent CLS on /shows/:id Overview tab — see PR "perf(shows):
// reserve layout space for deferred panels (CLS)".
export const SCHEDULE_TIMELINE_RESERVED_MIN_HEIGHT_PX = 420;

interface ScheduleTimelineProps {
  showId: string;
}

export function ScheduleTimeline({ showId }: ScheduleTimelineProps) {
  const { data, isLoading, error, refetch } = useScheduleTimeline(showId);

  if (isLoading) {
    return (
      <Card
        data-testid="schedule-timeline-skeleton"
        className="space-y-4 p-6"
        style={{ minHeight: `${SCHEDULE_TIMELINE_RESERVED_MIN_HEIGHT_PX}px` }}
        aria-busy="true"
        aria-label="Loading schedule"
      >
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="animate-pulse space-y-6">
          {[0, 1].map(dayIdx => (
            <div key={dayIdx} className="space-y-3">
              <div className="h-4 w-48 rounded bg-muted" />
              <div className="flex gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <div className="h-8 w-0.5 bg-muted" />
                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                  <div className="h-8 w-0.5 bg-muted" />
                  <div className="h-2.5 w-2.5 rounded-full bg-muted" />
                </div>
                <div className="flex-1 space-y-1.5">
                  <div className="h-14 rounded-md bg-muted" />
                  <div className="h-14 rounded-md bg-muted" />
                  <div className="h-14 rounded-md bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="flex items-center gap-2">
          <p className="text-sm text-destructive">Failed to load schedule.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm text-primary underline"
          >
            Try again
          </button>
        </div>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">No schedule available</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Schedule</h2>
      <div className="space-y-6">
        {data.map((day, i) => (
          <div key={day.date}>
            {i > 0 && <hr className="mb-6 border-border" />}
            <DaySection day={day} showId={showId} />
          </div>
        ))}
      </div>
    </Card>
  );
}
