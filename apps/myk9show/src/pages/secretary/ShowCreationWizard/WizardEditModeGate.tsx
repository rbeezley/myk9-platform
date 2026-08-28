/**
 * Stands in for the wizard's step content while an edit-mode target show is
 * unresolved.
 *
 * This is a write guard wearing a loading state. In `add-trials` /
 * `add-classes` the save path calls `updateShow(showId, ...)` with a FULL show
 * record built from the wizard store — and that store persists `show` and
 * `trials` across sessions. Rendering the steps before the target show is known
 * would show the PREVIOUS draft under an "Add Trials" title and write it over
 * the real show, fees and publication status included.
 *
 * The `unavailable` copy deliberately claims neither "missing" nor "failed": a
 * replicated read reports every failure as an empty list (MYK9-252), so a
 * settled-but-absent show is genuinely ambiguous. It states only what is
 * observable and offers the retry.
 */
import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WizardEditModeGateProps {
  state: 'loading' | 'unavailable';
  onRetry: () => void;
  onLeave: () => void;
}

export const WizardEditModeGate: React.FC<WizardEditModeGateProps> = ({
  state,
  onRetry,
  onLeave,
}) => {
  if (state === 'loading') {
    return (
      <div
        className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8 text-center"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Loading this show…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[320px] flex-col items-center justify-center gap-4 p-8 text-center"
      role="alert"
    >
      <AlertTriangle className="h-7 w-7 text-warning" aria-hidden="true" />
      <div className="max-w-md space-y-1">
        <h2 className="text-base font-semibold text-foreground">
          We couldn&rsquo;t open this show
        </h2>
        <p className="text-sm text-muted-foreground">
          The show didn&rsquo;t load, so we can&rsquo;t safely add to it — saving now could
          overwrite it. Check your connection and try again.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="outline" onClick={onLeave}>
          Back to shows
        </Button>
      </div>
    </div>
  );
};
