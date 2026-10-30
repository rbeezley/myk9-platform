import { Button } from '@/components/ui/button';

/** A refresh failed but the last good read is still shown: say so, and offer a retry. */
export function StaleReadNotice({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="mb-3 flex items-center justify-between gap-3 rounded-md border px-3 py-2"
      role="status"
    >
      <p className="text-sm text-muted-foreground">
        Couldn't refresh this show's dogs on this device. This may be out of date.
      </p>
      <Button variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
