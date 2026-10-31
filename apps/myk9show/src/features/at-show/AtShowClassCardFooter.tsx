import { CloudUpload, Heart, Info, MoreHorizontal } from 'lucide-react';
import type { ClassEntry } from '@myk9/ringside';
import { cn } from '@/lib/utils';

/** Gloved taps want 48px targets (INTENT s.6), so every icon button is h-12 w-12. */
const ICON_BUTTON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function queuedScoresLabel(count: number): string {
  return `${count} ${count === 1 ? 'score' : 'scores'} not uploaded yet`;
}

/** Completed over total, drawn only when the count is known and there is something to complete. */
function ClassProgressBar({ entry }: { entry: ClassEntry }) {
  const total = entry.entry_count;
  const done = Math.min(entry.completed_count, total);
  return (
    <div
      role="progressbar"
      aria-label={`${entry.class_name} scoring progress`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={`${done} of ${total} scored`}
      className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width]"
        style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
      />
    </div>
  );
}

interface AtShowClassCardFooterProps {
  entry: ClassEntry;
  /** False when the counts are unknown (not yet read, or an exhibitor's partial replica). */
  showProgress: boolean;
  queuedScoreCount: number;
  onToggleFavorite?: ((entry: ClassEntry) => void) | undefined;
  onShowDetails?: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
  onOpenOptions?: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
}

export function AtShowClassCardFooter({
  entry,
  showProgress,
  queuedScoreCount,
  onToggleFavorite,
  onShowDetails,
  onOpenOptions,
}: AtShowClassCardFooterProps) {
  const hasProgress = showProgress && entry.entry_count > 0;
  const hasActions = Boolean(onToggleFavorite || onShowDetails || onOpenOptions);
  if (!hasProgress && queuedScoreCount === 0 && !hasActions) return null;

  return (
    <div className="border-t border-border/60 px-2 pb-1 pt-1">
      {queuedScoreCount > 0 && (
        // Amber, from what this device queued: no clock, so a finished class never reads stale.
        <div className="flex items-center gap-1.5 px-2 pt-1 text-xs font-medium text-warning">
          <CloudUpload size={14} className="shrink-0" aria-hidden />
          {queuedScoresLabel(queuedScoreCount)}
        </div>
      )}
      <div className="flex items-center gap-1">
        {hasProgress ? <ClassProgressBar entry={entry} /> : <span className="flex-1" />}
        {onShowDetails && (
          <button
            type="button"
            aria-label={`Class details for ${entry.class_name}`}
            aria-haspopup="dialog"
            className={ICON_BUTTON}
            onClick={event => onShowDetails(entry, event.currentTarget)}
          >
            <Info size={20} aria-hidden />
          </button>
        )}
        {onToggleFavorite && (
          <button
            type="button"
            aria-label={`Favorite ${entry.class_name}`}
            aria-pressed={entry.is_favorite}
            className={ICON_BUTTON}
            onClick={() => onToggleFavorite(entry)}
          >
            <Heart
              size={20}
              aria-hidden
              className={cn(entry.is_favorite && 'fill-primary text-primary')}
            />
          </button>
        )}
        {onOpenOptions && (
          <button
            type="button"
            aria-label={`Class options for ${entry.class_name}`}
            aria-haspopup="dialog"
            className={ICON_BUTTON}
            onClick={event => onOpenOptions(entry, event.currentTarget)}
          >
            <MoreHorizontal size={20} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
