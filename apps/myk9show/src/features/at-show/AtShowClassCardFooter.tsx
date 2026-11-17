import { ClipboardList, CloudUpload, Heart, Info, MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ClassEntry } from '@myk9/ringside';
import { ClassProgressBar } from '@/components/status';
import { cn } from '@/lib/utils';

/** Gloved taps want 48px targets (INTENT s.6), so every icon button is h-12 w-12. */
const ICON_BUTTON =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function queuedScoresLabel(count: number): string {
  return `${count} ${count === 1 ? 'score' : 'scores'} not sent yet`;
}

interface AtShowClassCardFooterProps {
  entry: ClassEntry;
  /** The class status badge and scored count, first in the row (MYK9-1697). */
  status: ReactNode;
  /** False when the counts are unknown (not yet read, or an exhibitor's partial replica). */
  showProgress: boolean;
  queuedScoreCount: number;
  /** MYK9-2011: the count opens the Scores not sent list. */
  scoresNotSentHref?: string | undefined;
  onToggleFavorite?: ((entry: ClassEntry) => void) | undefined;
  onShowDetails?:
    ((entry: ClassEntry, anchor: HTMLElement, countsTrusted: boolean) => void) | undefined;
  onOpenOptions?: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
  /** MYK9-2137: the read-only Requirements view, for roles without Class Options. */
  onOpenRequirements?: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
}

export function AtShowClassCardFooter({
  entry,
  status,
  showProgress,
  queuedScoreCount,
  scoresNotSentHref,
  onToggleFavorite,
  onShowDetails,
  onOpenOptions,
  onOpenRequirements,
}: AtShowClassCardFooterProps) {
  const hasProgress = showProgress && entry.entry_count > 0;

  return (
    <div className="border-t border-border/60 pb-1 pl-4 pr-2 pt-1">
      {queuedScoreCount > 0 &&
        // Amber, from what this device holds: no clock, so a finished class never reads stale.
        (scoresNotSentHref ? (
          <Link
            to={scoresNotSentHref}
            className="flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-warning underline"
          >
            <CloudUpload size={14} className="shrink-0" aria-hidden />
            {queuedScoresLabel(queuedScoreCount)}
          </Link>
        ) : (
          <div className="flex items-center gap-1.5 px-2 pt-1 text-xs font-medium text-warning">
            <CloudUpload size={14} className="shrink-0" aria-hidden />
            {queuedScoresLabel(queuedScoreCount)}
          </div>
        ))}
      {/* Wraps rather than overflows: on a 320px phone the wider "Offline Scoring"
          badge would push the buttons past the card, so they drop to a line of
          their own, still right-aligned and 48px. */}
      <div className="flex min-h-12 flex-wrap items-center gap-2">
        {status}
        {hasProgress ? (
          <>
            <span className="flex-1 sm:hidden" aria-hidden />
            <ClassProgressBar
              label={`${entry.class_name} scoring progress`}
              done={entry.completed_count}
              total={entry.entry_count}
              // Phones drop the bar: beside the status, the count and three 48px buttons it
              // pushed the row past the card, and the "2 / 5" count already says it.
              className="max-sm:hidden"
            />
          </>
        ) : (
          <span className="flex-1" />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {onShowDetails && (
            <button
              type="button"
              aria-label={`Class details for ${entry.class_name}`}
              aria-haspopup="dialog"
              className={ICON_BUTTON}
              onClick={event => onShowDetails(entry, event.currentTarget, showProgress)}
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
          {onOpenRequirements && (
            <button
              type="button"
              aria-label={`Requirements for ${entry.class_name}`}
              aria-haspopup="dialog"
              className={ICON_BUTTON}
              onClick={event => onOpenRequirements(entry, event.currentTarget)}
            >
              <ClipboardList size={20} aria-hidden />
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
    </div>
  );
}
