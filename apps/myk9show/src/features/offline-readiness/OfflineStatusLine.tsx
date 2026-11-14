import { AlertTriangle, WifiOff } from 'lucide-react';
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
  /** MYK9-1995: the note is a held change needing a choice; it becomes a button that raises it. */
  onNoteClick?: (() => void) | undefined;
}

/**
 * The one amber "you are offline" rendering (MYK9-1744): WifiOff icon plus the sync note, which
 * carries the offline wording and the pending-change count. Shared by `OfflineReadyBadge` and
 * the ringside entry-list header chip so the wording and styling cannot drift apart.
 */
export function OfflineStatusLine({
  note,
  className,
  truncate,
  onNoteClick,
}: OfflineStatusLineProps) {
  return (
    <span
      role="status"
      title={OFFLINE_STATUS_TITLE}
      className={cn('inline-flex items-center text-warning', className)}
    >
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      {onNoteClick ? (
        <NoteChoiceButton note={note} onClick={onNoteClick} />
      ) : (
        <span className={cn(truncate && 'truncate')}>{note}</span>
      )}
    </span>
  );
}

/**
 * "1 change needs your choice" as a real button (MYK9-1995): amber, with an icon and a 44px target
 * so it reads as something to press at phone and desktop widths. Pressing it raises the same
 * choice notice the sync raised; the caller owns what that does.
 */
export function NoteChoiceButton({ note, onClick }: { note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-2 text-sm font-medium text-warning hover:bg-warning/20 sm:px-3"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
      {note}
    </button>
  );
}
