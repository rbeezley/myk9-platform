import { Button } from '@/components/ui/button';

/**
 * Shown in place of any entry-derived body while the manager's entry read is
 * loading or has failed, so the surface never renders a confident zero.
 *
 * Extracted from `ShowDetailTabs` when Setup became its own page (MYK9-630
 * phase 2): the Trials / Classes / Show Map views moved out of the tab strip
 * and still need the same guard, and a second copy of it would be a second
 * thing to keep in step.
 */
export function EntryDataUnavailablePanel({
  state,
  onRetry,
}: {
  state: 'loading' | 'error';
  onRetry?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-md border border-dashed bg-muted/20 px-4 py-6 text-sm">
      <div className="font-medium text-foreground">
        {state === 'loading' ? 'Entry counts are loading.' : "Couldn't load entry counts."}
      </div>
      <p className="mt-1 text-muted-foreground">
        Entry-derived counts and Show Map are paused so this page does not show a false zero-entry
        state.
      </p>
      {state === 'error' && onRetry && (
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
