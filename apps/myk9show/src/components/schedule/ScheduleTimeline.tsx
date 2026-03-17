import { useScheduleTimeline } from '@/hooks/queries/useScheduleTimeline';
import { DaySection } from './DaySection';

interface ScheduleTimelineProps {
  showId: string;
}

export function ScheduleTimeline({ showId }: ScheduleTimelineProps) {
  const { data, isLoading, error, refetch } = useScheduleTimeline(showId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-muted" />
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
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
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Schedule</h2>
        <p className="text-sm text-muted-foreground">No schedule available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Schedule</h2>
      <div className="space-y-6">
        {data.map((day, i) => (
          <div key={day.date}>
            {i > 0 && <hr className="mb-6 border-border" />}
            <DaySection day={day} showId={showId} />
          </div>
        ))}
      </div>
    </div>
  );
}
