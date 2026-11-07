/**
 * MYK9-1744: the scoresheet's one offline signal. A small amber wifi-off icon beside the Up
 * control, shown only while the device is offline. Tapping it says, in one sentence, that scores
 * are safe. Hidden online, so the pinned header keeps its MYK9-1697 height. Calm by design
 * (INTENT): an icon and one reassuring line, never a banner.
 */
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export const OFFLINE_SCORES_MESSAGE =
  "Scores are saved on this device and will sync when you're back online.";

function readOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

interface OfflineScoresIndicatorProps {
  /** The popover sentence. Defaults to the scoresheet wording. */
  message?: string;
  /** The host's own online state, when it has one; otherwise `navigator.onLine` is tracked. */
  isOnline?: boolean;
}

export function OfflineScoresIndicator({
  message = OFFLINE_SCORES_MESSAGE,
  isOnline,
}: OfflineScoresIndicatorProps = {}) {
  const [trackedOnline, setOnline] = useState(readOnline);
  const online = isOnline ?? trackedOnline;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setOpen(false);
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="Offline"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-warning hover:bg-warning/10"
      >
        <WifiOff className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <span
          role="status"
          className="absolute left-0 top-full z-20 mt-1 w-64 rounded-md border border-warning/30 bg-card p-3 text-sm text-foreground shadow-md"
        >
          {message}
        </span>
      )}
    </span>
  );
}
