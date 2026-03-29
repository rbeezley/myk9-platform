/**
 * ScoringEntryCard - Entry card for the scoring entry list
 *
 * Displays entry information with status indication and drag handle.
 * Uses Tailwind styling consistent with myK9Show.
 */

import { forwardRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  GripVertical,
  CheckCircle2,
  Circle,
  AlertCircle,
  Trophy,
  ChevronRight,
  MoreVertical,
  RotateCcw,
} from 'lucide-react';
import type { ScoringEntry } from '../types';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';

interface ScoringEntryCardProps {
  entry: ScoringEntry;
  onSelect?: (entry: ScoringEntry) => void;
  onResetScore?: (entry: ScoringEntry) => void;
  isDragging?: boolean;
  className?: string;
}

/**
 * Get status color and icon
 */
function getStatusDisplay(entry: ScoringEntry) {
  if (entry.isScored) {
    const isQualified = entry.result?.qualification === 'Qualified';
    return {
      icon: isQualified ? (
        <CheckCircle2 className="h-5 w-5 text-teal-500" />
      ) : (
        <AlertCircle className="h-5 w-5 text-amber-500" />
      ),
      badge: isQualified ? 'Q' : 'NQ',
      badgeClass: isQualified ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700',
    };
  }

  if (entry.inRing) {
    return {
      icon: <Circle className="h-5 w-5 text-blue-500 fill-blue-500" />,
      badge: 'In Ring',
      badgeClass: 'bg-blue-100 text-blue-700',
    };
  }

  if (entry.status === 'pulled') {
    return {
      icon: <AlertCircle className="h-5 w-5 text-muted-foreground" />,
      badge: 'Pulled',
      badgeClass: 'bg-muted text-muted-foreground',
    };
  }

  return {
    icon: <Circle className="h-5 w-5 text-muted-foreground" />,
    badge: null,
    badgeClass: '',
  };
}

/**
 * Base entry card component
 */
export const ScoringEntryCard = forwardRef<HTMLDivElement, ScoringEntryCardProps>(
  ({ entry, onSelect, onResetScore, isDragging, className, ...props }, ref) => {
    const status = getStatusDisplay(entry);
    const [menuOpen, setMenuOpen] = useState(false);

    const handleClick = () => {
      if (!entry.isScored) {
        onSelect?.(entry);
      }
    };

    const handleMenuToggle = (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuOpen(prev => !prev);
    };

    const handleResetScore = (e: React.MouseEvent) => {
      e.stopPropagation();
      setMenuOpen(false);
      onResetScore?.(entry);
    };

    return (
      <div
        ref={ref}
        onClick={handleClick}
        className={cn(
          'group relative flex items-center gap-3 p-4 bg-card border rounded-xl',
          !entry.isScored && 'cursor-pointer hover:bg-accent/50 hover:border-accent',
          'transition-colors',
          isDragging && 'shadow-lg ring-2 ring-primary opacity-90',
          entry.isScored && 'bg-muted/30',
          className
        )}
        {...props}
      >
        {/* Drag Handle (pending only) */}
        {!entry.isScored && (
          <div className="shrink-0 touch-none">
            <GripVertical className="h-5 w-5 text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
        )}

        {/* Armband Badge */}
        <ArmbandBadge armband={entry.armband} />

        {/* Entry Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{entry.callName}</h3>
            {status.badge && (
              <span
                className={cn('px-2 py-0.5 text-xs font-medium rounded-full', status.badgeClass)}
              >
                {status.badge}
              </span>
            )}
          </div>
          {entry.isScored && entry.result ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {entry.result.time > 0 && (
                <span className="font-mono">{formatTime(entry.result.time)}</span>
              )}
              {entry.result.qualification === 'Qualified' && entry.result.faults > 0 && (
                <span>
                  {entry.result.faults} fault{entry.result.faults !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground truncate">{entry.breed}</p>
              <p className="text-xs text-muted-foreground truncate">Handler: {entry.handler}</p>
            </>
          )}
        </div>

        {/* Placement (if scored) */}
        {entry.placement && entry.placement <= 4 && (
          <div className="shrink-0 flex items-center gap-1">
            <Trophy
              className={cn(
                'h-5 w-5',
                entry.placement === 1 && 'text-amber-500',
                entry.placement === 2 && 'text-gray-400',
                entry.placement === 3 && 'text-amber-700',
                entry.placement === 4 && 'text-blue-500'
              )}
            />
            <span className="text-sm font-medium">{entry.placement}</span>
          </div>
        )}

        {/* Trailing: Chevron for pending, 3-dot menu for completed */}
        {entry.isScored ? (
          <div className="relative shrink-0">
            <button
              onClick={handleMenuToggle}
              className="p-1.5 rounded-full hover:bg-accent transition-colors"
              aria-label="Entry actions"
            >
              <MoreVertical className="h-5 w-5 text-muted-foreground" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={handleMenuToggle} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
                  <button
                    onClick={handleResetScore}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset Score
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </div>
    );
  }
);

ScoringEntryCard.displayName = 'ScoringEntryCard';

/**
 * Sortable wrapper for drag-and-drop
 */
export function SortableScoringEntryCard({ entry, onSelect, onResetScore }: ScoringEntryCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: entry.isScored,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && { zIndex: 50 }),
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(!entry.isScored && listeners)}>
      <ScoringEntryCard
        entry={entry}
        {...(onSelect !== undefined && { onSelect })}
        {...(onResetScore !== undefined && { onResetScore })}
        isDragging={isDragging}
      />
    </div>
  );
}

/**
 * Format milliseconds to M:SS.ss
 */
function formatTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, '0')}`;
}
