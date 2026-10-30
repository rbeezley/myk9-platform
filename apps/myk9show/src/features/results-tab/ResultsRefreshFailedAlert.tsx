import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** A background refresh failed but earlier data is still shown; say so and offer Retry. */
export function ResultsRefreshFailedAlert({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert>
      <AlertTitle>Couldn&apos;t refresh the scores</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>What is shown may be out of date. Check your connection and try again.</span>
        <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
