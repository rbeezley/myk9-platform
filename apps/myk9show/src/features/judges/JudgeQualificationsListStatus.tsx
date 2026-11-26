import React from 'react';
import { Button } from '@/components/ui/button';

/** MYK9-2394: shown in place of the list while it is loading, offline with nothing cached. */
export const JudgeQualificationsLoading: React.FC<{ offline: boolean }> = ({ offline }) =>
  offline ? (
    <p role="status" className="py-8 text-center text-muted-foreground">
      You're offline. Judge qualifications show when you reconnect.
    </p>
  ) : (
    <div role="status" aria-label="Loading judge qualifications" className="space-y-4">
      {[1, 2].map(i => (
        <div
          key={i}
          className="animate-pulse rounded-xl border-l-4 border-amber-500/30 bg-muted/10 p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-6 w-16 rounded-full bg-muted" />
            <div className="h-6 w-16 rounded-full bg-muted" />
          </div>
          <div className="h-4 w-32 rounded bg-muted" />
        </div>
      ))}
    </div>
  );

/** A failed read. `refresh` means an earlier list is still on screen, so say what didn't happen. */
export const JudgeQualificationsLoadError: React.FC<{
  onRetry: () => void;
  refresh?: boolean;
}> = ({ onRetry, refresh = false }) => (
  <div
    role="alert"
    className={
      refresh
        ? 'flex items-center justify-between gap-3 rounded-xl bg-muted/20 px-4 py-3 text-sm'
        : 'flex flex-col items-center gap-3 py-8 text-center'
    }
  >
    <p className="text-muted-foreground">
      {refresh
        ? "Couldn't refresh these qualifications. Editing is off until they load."
        : "Couldn't load this person's judge qualifications."}
    </p>
    <Button variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  </div>
);
