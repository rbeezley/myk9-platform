import { CloudDownload, RefreshCw, ShieldCheck } from 'lucide-react';
import { useOfflineReadiness } from './useOfflineReadiness';

interface OfflineReadyBadgeProps {
  showId: string | undefined;
}

/**
 * Ambient per-show offline readiness (MYK9-203), styled after
 * ShowDeskSyncStatus. Green: this device can run the show without internet.
 * Not ready: the badge itself is the fix — clicking it primes the show.
 */
export function OfflineReadyBadge({ showId }: OfflineReadyBadgeProps) {
  const { readiness, priming, primeFailed, prime } = useOfflineReadiness(showId);

  if (!readiness) return null;

  if (readiness.ready) {
    const asOf = readiness.asOf
      ? new Date(readiness.asOf).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
    return (
      <span
        role="status"
        // "Oldest sync" rather than "as of": some scopes (the show row, judge
        // assignments) have no per-scope watermark, so this is the oldest
        // KNOWN sync, not a guarantee about every cached row.
        title={
          asOf
            ? `This show and your permissions are saved on this device. Oldest sync: ${asOf}.`
            : 'This show and your permissions are saved on this device.'
        }
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 text-sm text-success"
      >
        <ShieldCheck className="h-4 w-4" />
        Offline ready
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void prime()}
      disabled={priming}
      title={
        primeFailed
          ? "Couldn't save the show to this device — you may be offline. Try again once you have a connection."
          : 'This device would not survive losing internet for this show. Tap to save the show to this device.'
      }
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20 disabled:opacity-70"
    >
      {priming ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" />
          Preparing for offline…
        </>
      ) : (
        <>
          <CloudDownload className="h-4 w-4" />
          {primeFailed ? "Couldn't prepare — retry" : 'Not offline ready'}
        </>
      )}
    </button>
  );
}
