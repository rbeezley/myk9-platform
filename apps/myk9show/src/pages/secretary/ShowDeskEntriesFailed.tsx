import { Button } from '@/components/ui/button';

/**
 * Shown INSTEAD of the surface when the entries read failed with nothing
 * cached: everything below would otherwise state a zero it never read.
 * `pausedWhat` names what is paused, so the secretary knows what to distrust.
 */
export function ShowDeskEntriesFailed({
  pausedWhat,
  onRetry,
}: {
  pausedWhat: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Couldn't load show entries.</p>
      <p className="mt-1 text-muted-foreground">
        {pausedWhat} paused so they do not show a false zero-entry state.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
