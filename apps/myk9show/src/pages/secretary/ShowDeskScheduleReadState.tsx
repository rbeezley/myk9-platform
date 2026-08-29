import { Button } from '@/components/ui/button';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';

interface ShowDeskScheduleReadStateProps {
  hasConfirmedSnapshot: boolean;
  readFailed: boolean;
  readPending: boolean;
  onRetry: () => void;
}

export function ShowDeskScheduleUnavailable({
  hasConfirmedSnapshot,
  readFailed,
  readPending,
  onRetry,
}: ShowDeskScheduleReadStateProps) {
  if (hasConfirmedSnapshot) return null;

  // INTENT: An unread local replica is unknown, not an empty schedule. Pause
  // status claims until both schedule dependencies have produced a confirmed
  // snapshot; this keeps Show Desk calm and truthful during show-day failures.
  if (readFailed) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Couldn't load the show schedule.</p>
        <p className="mt-1 text-muted-foreground">
          Class timing and show-day status are paused so they do not show an empty schedule that
          wasn't read.
        </p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry schedule
        </Button>
      </div>
    );
  }

  return readPending ? <LoadingSkeleton variant="cards" count={2} /> : null;
}

export function ShowDeskScheduleRefreshWarning({
  hasConfirmedSnapshot,
  readFailed,
  onRetry,
}: Omit<ShowDeskScheduleReadStateProps, 'readPending'>) {
  if (!readFailed || !hasConfirmedSnapshot) return null;

  return (
    <div className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-medium">Couldn't refresh the show schedule.</p>
      <p className="mt-1 text-muted-foreground">
        The last loaded schedule is still shown. Retry when you're ready.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
        Retry schedule
      </Button>
    </div>
  );
}
