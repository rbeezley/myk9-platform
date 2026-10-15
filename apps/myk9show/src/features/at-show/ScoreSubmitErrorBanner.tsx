import { AlertCircle } from 'lucide-react';

/**
 * A genuine "score not saved" failure: the durable queue write threw or returned
 * no mutation id. Unlike the calm offline indicator, this is an error the judge
 * MUST act on: the score is NOT saved and they stayed on the sheet to retry.
 * Alarm tone is intentional here. Shared by the live scoresheet and the
 * held-entry notice (MYK9-1162) so both say the same thing the same way.
 */
export function ScoreSubmitErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground"
    >
      <AlertCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="ml-2 underline underline-offset-2">
        Dismiss
      </button>
    </div>
  );
}
