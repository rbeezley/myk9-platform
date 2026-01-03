import * as React from 'react';
import { cn } from '../../utils/cn';

/**
 * Class status type matching myK9Q statuses
 */
export type ClassStatus =
  | 'none'
  | 'setup'
  | 'briefing'
  | 'break'
  | 'start-time'
  | 'in-progress'
  | 'offline-scoring'
  | 'completed';

/**
 * Entry preview data
 */
export interface ClassCardEntry {
  id: number | string;
  armband: number;
  inRing?: boolean;
  isScored?: boolean;
}

/**
 * Props for ClassCard component
 */
export interface ClassCardProps {
  /** Class name/title */
  className: string;
  /** Judge name */
  judgeName?: string;
  /** Planned start time (formatted string) */
  plannedStartTime?: string;
  /** Current class status */
  status: ClassStatus;
  /** Status label to display */
  statusLabel: string;
  /** Optional time to show with status (e.g., "10:30 AM") */
  statusTime?: string;
  /** Icon to show in status badge */
  statusIcon?: React.ReactNode;
  /** Total number of entries */
  entryCount: number;
  /** Number of completed entries */
  completedCount: number;
  /** Whether this class is favorited */
  isFavorite?: boolean;
  /** Entries for preview (in-ring + next dogs) */
  entries?: ClassCardEntry[];
  /** Click handler for the card */
  onCardClick?: () => void;
  /** Click handler for favorite button */
  onFavoriteClick?: () => void;
  /** Click handler for menu button */
  onMenuClick?: () => void;
  /** Click handler for status badge */
  onStatusClick?: () => void;
  /** Click handler for info button */
  onInfoClick?: () => void;
  /** Whether status badge is clickable */
  statusClickable?: boolean;
  /** Whether favorite was just toggled (for animation) */
  favoriteJustToggled?: boolean;
  /** Whether status just changed (for animation) */
  statusJustChanged?: boolean;
  /** Additional action buttons (rendered in actions area) */
  actions?: React.ReactNode;
  /** Warning banners (rendered at bottom of card) */
  warnings?: React.ReactNode;
  /** Additional className for the card container */
  containerClassName?: string;
}

/**
 * Status color classes for left border and badge
 */
const statusColors: Record<ClassStatus, string> = {
  none: 'border-l-gray-400',
  setup: 'border-l-slate-500',
  briefing: 'border-l-sky-500',
  break: 'border-l-orange-500',
  'start-time': 'border-l-violet-500',
  'in-progress': 'border-l-teal-500',
  'offline-scoring': 'border-l-amber-500',
  completed: 'border-l-green-500',
};

const statusBadgeColors: Record<ClassStatus, string> = {
  none: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  setup: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  briefing: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  break: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'start-time': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'in-progress': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'offline-scoring': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
};

/**
 * ClassCard Component
 *
 * A shared class display card matching myK9Q's visual design.
 * Features:
 * - Status-colored left border
 * - Corner status badge with icon
 * - Progress bar
 * - Entry preview with in-ring indicator
 * - Favorite and menu buttons
 * - Hover and touch effects
 *
 * @example
 * ```tsx
 * <ClassCard
 *   className="Novice A Buried"
 *   judgeName="Jane Smith"
 *   status="in-progress"
 *   statusLabel="In Progress"
 *   statusTime="10:30 AM"
 *   statusIcon={<PlayCircle size={18} />}
 *   entryCount={12}
 *   completedCount={5}
 *   isFavorite={false}
 *   entries={[
 *     { id: 1, armband: 102, inRing: true },
 *     { id: 2, armband: 105 },
 *     { id: 3, armband: 108 },
 *   ]}
 *   onCardClick={() => navigate(`/entries/${classId}`)}
 *   onFavoriteClick={() => toggleFavorite(classId)}
 *   onStatusClick={() => openStatusDialog(classId)}
 * />
 * ```
 */
export const ClassCard = React.forwardRef<HTMLDivElement, ClassCardProps>(
  (
    {
      className,
      judgeName,
      plannedStartTime,
      status,
      statusLabel,
      statusTime,
      statusIcon,
      entryCount,
      completedCount,
      isFavorite = false,
      entries = [],
      onCardClick,
      onFavoriteClick,
      onMenuClick,
      onStatusClick,
      onInfoClick,
      statusClickable = false,
      favoriteJustToggled = false,
      statusJustChanged = false,
      actions,
      warnings,
      containerClassName,
    },
    ref
  ) => {
    // Calculate progress percentage
    const progressPercent =
      entryCount > 0 ? (completedCount / entryCount) * 100 : 0;

    // Get entries for preview
    const inRingEntry = entries.find((e) => e.inRing);
    const nextEntries = entries
      .filter((e) => !e.isScored && !e.inRing)
      .slice(0, 3);
    const remainingCount = entryCount - completedCount;

    // Handle card click (ignore clicks on interactive elements)
    const handleCardClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('button') ||
        target.closest('[data-interactive]')
      ) {
        return;
      }
      onCardClick?.();
    };

    return (
      <div
        ref={ref}
        className={cn(
          // Base card styles
          'relative overflow-visible cursor-pointer',
          'bg-white dark:bg-gray-900',
          'border border-gray-200 dark:border-gray-700',
          'rounded-2xl shadow-sm',
          // Left status border
          'border-l-4',
          statusColors[status],
          // Hover effects
          'transition-all duration-200',
          'hover:-translate-y-1 hover:shadow-md',
          'active:scale-[0.98]',
          // Glass morphism
          'backdrop-blur-xl',
          containerClassName
        )}
        onClick={handleCardClick}
      >
        {/* Status Badge - Top Right Corner */}
        <div className="absolute -top-px -right-px z-10">
          {statusClickable && onStatusClick ? (
            <button
              type="button"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2',
                'rounded-bl-2xl rounded-tr-2xl',
                'text-xs font-semibold uppercase tracking-wide',
                'border-none cursor-pointer',
                'transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-sm',
                statusBadgeColors[status],
                status === 'in-progress' && 'animate-pulse',
                statusJustChanged && 'animate-bounce'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onStatusClick();
              }}
            >
              {statusIcon && (
                <span className="flex-shrink-0 w-[18px] h-[18px]">
                  {statusIcon}
                </span>
              )}
              <span>
                {statusLabel}
                {statusTime && (
                  <span className="ml-1 font-bold">{statusTime}</span>
                )}
              </span>
            </button>
          ) : (
            <div
              className={cn(
                'flex items-center gap-1.5 px-3 py-2',
                'rounded-bl-2xl rounded-tr-2xl',
                'text-xs font-semibold uppercase tracking-wide',
                statusBadgeColors[status],
                status === 'in-progress' && 'animate-pulse',
                statusJustChanged && 'animate-bounce'
              )}
            >
              {statusIcon && (
                <span className="flex-shrink-0 w-[18px] h-[18px]">
                  {statusIcon}
                </span>
              )}
              <span>
                {statusLabel}
                {statusTime && (
                  <span className="ml-1 font-bold">{statusTime}</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Card Content */}
        <div className="p-4 pb-2">
          {/* Header Section */}
          <div className="relative pr-20 pb-2 min-h-[44px]">
            {/* Action Buttons - Top Right (below status badge) */}
            <div className="absolute top-8 right-1 flex items-center gap-1.5 z-10">
              {/* Favorite Button */}
              {onFavoriteClick && (
                <button
                  type="button"
                  className={cn(
                    'w-9 h-9 flex items-center justify-center',
                    'rounded-lg cursor-pointer',
                    'transition-all duration-300',
                    'bg-gray-100 dark:bg-gray-800',
                    'border border-gray-200 dark:border-gray-700',
                    'hover:bg-red-500 hover:text-white hover:border-transparent',
                    'hover:scale-110 hover:-rotate-6 hover:shadow-lg hover:shadow-red-500/40',
                    'active:scale-95 active:rotate-0',
                    isFavorite && 'bg-red-100 dark:bg-red-900/30 border-red-400 text-red-500',
                    favoriteJustToggled && 'animate-bounce'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavoriteClick();
                  }}
                >
                  <svg
                    className={cn('w-5 h-5', isFavorite && 'fill-current')}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                </button>
              )}

              {/* Menu Button */}
              {onMenuClick && (
                <button
                  type="button"
                  className={cn(
                    'w-9 h-9 flex items-center justify-center',
                    'rounded-lg cursor-pointer',
                    'transition-all duration-300',
                    'bg-gray-100 dark:bg-gray-800',
                    'border border-gray-200 dark:border-gray-700',
                    'hover:bg-teal-500 hover:text-white hover:border-transparent',
                    'hover:scale-110 hover:-rotate-6 hover:shadow-lg hover:shadow-teal-500/40',
                    'active:scale-95 active:rotate-0'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onMenuClick();
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                    <circle cx="5" cy="12" r="1" />
                  </svg>
                </button>
              )}

              {/* Additional Actions */}
              {actions}
            </div>

            {/* Class Title Section */}
            <div className="flex flex-col gap-0 text-left">
              {/* Class Name with Info Button */}
              <div
                className={cn(
                  'flex items-start gap-1.5 cursor-pointer',
                  'p-0.5 -mx-1 rounded-md',
                  'transition-colors duration-150',
                  'hover:bg-blue-500/10',
                  'w-fit max-w-full mt-2 mb-2'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onInfoClick?.();
                }}
                data-interactive
              >
                <h3 className="m-0 text-xl font-bold text-gray-900 dark:text-white leading-tight tracking-tight">
                  {className}
                </h3>
                {onInfoClick && (
                  <span className="mt-1 w-4 h-4 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-[10px] opacity-60 hover:opacity-100 hover:bg-blue-500 hover:text-white transition-all">
                    i
                  </span>
                )}
              </div>

              {/* Metadata */}
              <div className="flex flex-col gap-1 mt-1">
                {judgeName && (
                  <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-3.5 h-3.5 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    Judge: {judgeName}
                  </div>
                )}

                {plannedStartTime && (
                  <div className="hidden sm:flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                    <svg className="w-3.5 h-3.5 opacity-70 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span>Planned:</span>
                    <span className="font-semibold text-blue-500">{plannedStartTime}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status Preview Section */}
          <div className="mt-1">
            {/* Progress Bar */}
            {entryCount > 0 && (
              <div className="h-[3px] bg-gray-200 dark:bg-gray-700 rounded-full mt-2 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-300',
                    status === 'completed'
                      ? 'bg-green-500'
                      : 'bg-teal-500'
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}

            {/* Entry Preview */}
            {entries.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2.5 pt-2 mt-1 font-mono text-sm font-medium text-gray-400">
                {/* In-ring dog */}
                {inRingEntry && (
                  <span className="inline-flex items-center text-amber-500">
                    <span className="w-2 h-2 rounded-full bg-amber-500 mr-1" />
                    #{inRingEntry.armband}
                  </span>
                )}

                {/* Next dogs */}
                {nextEntries.map((entry) => (
                  <span key={entry.id} className="text-gray-500 dark:text-gray-400">
                    #{entry.armband}
                  </span>
                ))}

                {/* Remaining count */}
                <span className="ml-auto text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  {status === 'completed'
                    ? 'All complete'
                    : `${remainingCount} of ${entryCount} remaining`}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-3 mt-2 font-mono text-sm text-gray-400">
                <svg className="w-4 h-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>No entries yet</span>
              </div>
            )}

            {/* Warning Banners */}
            {warnings && <div className="mt-3">{warnings}</div>}
          </div>
        </div>
      </div>
    );
  }
);

ClassCard.displayName = 'ClassCard';
