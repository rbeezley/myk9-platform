import { WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The full sentence behind the amber offline state (MYK9-1744), kept in `title` when truncated. */
export const OFFLINE_STATUS_TITLE =
  'You are offline. Everything you enter is saved on this device.';

interface OfflineStatusLineProps {
  /** The device note (`useSyncNote().label`): offline wording plus the pending-change count. */
  note: string;
  className?: string;
  /** Clip the label to one line (compact headers); the full sentence stays in `title`. */
  truncate?: boolean;
}

/**
 * The one amber "you are offline" rendering (MYK9-1744): WifiOff icon plus the sync note, which
 * carries the offline wording and the pending-change count. Shared by `OfflineReadyBadge` and
 * the ringside entry-list header chip so the wording and styling cannot drift apart.
 */
export function OfflineStatusLine({ note, className, truncate }: OfflineStatusLineProps) {
  return (
    <span
      role="status"
      title={OFFLINE_STATUS_TITLE}
      className={cn('inline-flex items-center text-warning', className)}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      <span className={cn(truncate && 'truncate')}>{note}</span>
    </span>
  );
}
