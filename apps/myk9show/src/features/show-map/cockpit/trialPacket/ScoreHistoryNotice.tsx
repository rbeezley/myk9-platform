import { Button } from '@/components/ui/button';

/**
 * The note both judge packets show when the score history is missing, so a printed packet never
 * silently lacks its changed-score marks. Offline there is nothing to retry, so no button.
 */
export function ScoreHistoryNotice({ paused, onRetry }: { paused: boolean; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
    >
      <span>
        {paused
          ? 'You are offline, so the score history is not available.'
          : 'The score history could not be read.'}{' '}
        Scores changed after the judge submitted them are not marked. You can still print.
      </span>
      {!paused && (
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
