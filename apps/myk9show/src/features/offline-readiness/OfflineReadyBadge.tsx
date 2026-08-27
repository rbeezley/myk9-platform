import { CloudDownload, RefreshCw, ShieldCheck } from 'lucide-react';
import { useOfflineReadiness } from './useOfflineReadiness';

interface OfflineReadyBadgeProps {
  showId: string | undefined;
}

/**
 * Ambient per-show offline readiness (MYK9-203), styled after
 * ShowDeskSyncStatus. Green: this device can run the show without internet.
 * Not ready: the badge itself is the fix — clicking it primes the show.
 *
 * Every word of meaning used to live in `title`, which is hover-only. INTENT
 * bans hover-only interactions outright, and the surfaces this appears on are
 * tablets at ringside where there is no hover at all — so the one control that
 * recovers a device with no connection explained itself only to a mouse. The
 * visible label now names the ACTION.
 *
 * `title` deliberately stays a DESCRIPTION rather than becoming an aria-label:
 * aria-label replaces the accessible name outright, and a name that does not
 * contain the visible words breaks WCAG 2.5.3 (Label in Name) for anyone
 * driving the app by voice.
 */
export function OfflineReadyBadge({ showId }: OfflineReadyBadgeProps) {
  const { readiness, priming, primeFailed, prime } = useOfflineReadiness(showId);

  if (!readiness) return null;

  if (readiness.ready) {
    const asOfDetail = readiness.asOf
      ? new Date(readiness.asOf).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;
    const readyDetail = asOfDetail
      ? `This show and your permissions are saved on this device. Oldest sync: ${asOfDetail}.`
      : 'This show and your permissions are saved on this device.';
    return (
      <span
        role="status"
        // "Oldest sync" rather than "as of": some scopes (the show row, judge
        // assignments) have no per-scope watermark, so this is the oldest
        // KNOWN sync, not a guarantee about every cached row.
        title={readyDetail}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 text-sm text-success"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Offline ready
      </span>
    );
  }

  const actionDetail = primeFailed
    ? "Couldn't save the show to this device. You may be offline. Try again once you have a connection."
    : 'This device would not survive losing internet for this show. Save the show to this device.';

  return (
    <button
      type="button"
      onClick={() => void prime()}
      disabled={priming}
      title={actionDetail}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20 disabled:opacity-70"
    >
      {priming ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          Preparing for offline…
        </>
      ) : (
        <>
          <CloudDownload className="h-4 w-4" aria-hidden />
          {/* Names the action, not just the state: "Not offline ready" told a
              steward what was wrong but never what tapping would do, and that
              half lived only in the hover title. */}
          {primeFailed ? "Couldn't save · Try again" : 'Not offline ready · Save now'}
        </>
      )}
    </button>
  );
}
