import { Button } from '@/components/ui/button';

/**
 * Banner shown above the desk when the entries read settled without data.
 *
 * Deliberately a BANNER, not a replacement for the page. The first version of
 * this fix returned it INSTEAD of the desk, which cost an offline secretary the
 * class schedule, ring assignments and times -- none of which come from the
 * entries query at all. It also had the side effect of making the whole
 * unknown-count chain below it unreachable, so the "I don't know" states this
 * sweep built stayed dead code, one layer further out than where they started.
 *
 * The scope wording matters: naming exactly which surfaces are paused is more
 * useful on a show day than a blanket error, because it tells the secretary
 * what they can still trust.
 */
export function ShowDeskEntriesUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="status"
      className="mb-4 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm"
    >
      <p className="font-medium">Entry data isn&rsquo;t available right now.</p>
      <p className="mt-1 text-muted-foreground">
        Entry counts, scored progress, People at show and closeout are shown as unknown rather
        than zero. Class times, rings and judges below are unaffected.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
