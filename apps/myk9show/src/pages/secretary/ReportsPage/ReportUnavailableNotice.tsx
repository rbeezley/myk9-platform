import { Button } from '@/components/ui/button';

/**
 * The preview's "could not be checked" notice: no connection, so the app never got to ask.
 * That is different from the selection being empty, and the copy says so.
 */
export function ReportUnavailableNotice({
  source,
  onRetry,
}: {
  /** What could not be checked: the show's entries, or the report's own hosted details. */
  source: 'entries' | 'details';
  onRetry?: (() => void) | undefined;
}) {
  const entries = source === 'entries';
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="font-medium">
        {entries
          ? "This show's entries could not be checked."
          : "This report's details could not be checked."}
      </p>
      <p className="max-w-prose text-sm text-muted-foreground">
        {entries
          ? 'There is no connection right now, so the app has not been able to ask how many dogs are entered. That is different from the class being empty. Reconnect and this will fill in.'
          : 'There is no connection right now, and this report needs details that are not stored on this device. That is different from there being nothing to print. Reconnect and this will fill in.'}
      </p>
      {entries && onRetry && (
        <Button type="button" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
