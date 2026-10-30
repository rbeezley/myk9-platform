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

/** This device has no completed sync of the show, so the list may be missing dogs or classes. */
export function PartialReplicaNotice({ blocksCheckIn = false }: { blocksCheckIn?: boolean }) {
  return (
    <p className="mb-3 rounded-md border px-3 py-2 text-sm text-muted-foreground" role="status">
      {blocksCheckIn
        ? 'Connect to sync this show before checking in to every class. You can still check in class by class from the class links below.'
        : "This device hasn't finished syncing this show, so some dogs or classes may be missing."}
    </p>
  );
}
