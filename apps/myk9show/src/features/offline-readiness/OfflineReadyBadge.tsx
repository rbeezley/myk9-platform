import { CloudDownload, RefreshCw, ShieldCheck } from 'lucide-react';
import { useOfflineReadiness } from './useOfflineReadiness';

interface OfflineReadyBadgeProps {
  showId: string | undefined;
  /** The device's change status, folded onto the same line (e.g. "All changes saved"). */
  note?: string | undefined;
  /** Whether the note needs the secretary's attention (conflict, error) rather than reassures. */
  noteNeedsAttention?: boolean | undefined;
}

/**
 * Ambient per-show offline readiness (MYK9-203), styled after
 * ShowDeskSyncStatus. Green: this device can run the show without internet.
 * Not ready: the badge itself is the fix — clicking it primes the show.
 *
 * MYK9-1282: one plain sentence ("Offline copy: not saved on this device") plus one action
 * ("Save for show day"), instead of a button whose label needed a tooltip. The device's change
 * status ("All changes saved") is folded into the same line through `note`, so the header
 * carries one device line, visually separate from the show's status.
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
export function OfflineReadyBadge({ showId, note, noteNeedsAttention }: OfflineReadyBadgeProps) {
  const { readiness, priming, primeFailed, prime } = useOfflineReadiness(showId);

  const noteText = note ? (
    <span className={noteNeedsAttention ? 'text-warning' : 'text-muted-foreground'}>{note}</span>
  ) : null;

  if (!readiness) {
    return noteText ? (
      <span role="status" className="inline-flex min-h-11 items-center text-sm">
        {noteText}
      </span>
    ) : null;
  }

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
        className="inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-success"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        Offline copy: saved on this device
        {noteText && <span aria-hidden="true">·</span>}
        {noteText}
      </span>
    );
  }

  const actionDetail = primeFailed
    ? "Couldn't save the show to this device. You may be offline. Try again once you have a connection."
    : 'This device would not survive losing internet for this show. Save the show to this device.';

  return (
    <span className="inline-flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <span role="status" className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-2 text-warning">
          <CloudDownload className="h-4 w-4" aria-hidden />
          {primeFailed
            ? "Couldn't save the offline copy"
            : 'Offline copy: not saved on this device'}
        </span>
        {noteText && <span aria-hidden="true">·</span>}
        {noteText}
      </span>
      <button
        type="button"
        onClick={() => void prime()}
        disabled={priming}
        title={actionDetail}
        // Which signals are missing, for diagnosis (MYK9-766): the visible copy
        // deliberately names the action, not the scopes.
        data-offline-missing={readiness.missing.join(',')}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 text-sm text-warning hover:bg-warning/20 disabled:opacity-70"
      >
        {priming ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
            Saving to this device…
          </>
        ) : primeFailed ? (
          'Try again'
        ) : (
          'Save for show day'
        )}
      </button>
    </span>
  );
}
