import { Button } from '@/components/ui/button';

/**
 * Shown when the entries read settled without producing data.
 *
 * The wording is deliberate about SCOPE: the surfaces that derive from entries
 * are paused, while class times and ring assignments -- which come from the
 * replicated trial/class stores, not this query -- are still trustworthy. On a
 * show-day desk "some of this is stale" is far more useful than a blanket
 * error, and blanking the whole page would cost the secretary the schedule they
 * came for.
 */
export function ShowDeskEntriesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-medium">Entry data isn&rsquo;t available right now.</p>
      <p className="mt-1 text-muted-foreground">
        Entry counts, People at show, Show Map and closeout are paused so they do not show a false
        zero-entry state. Class times and ring assignments below are unaffected.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
