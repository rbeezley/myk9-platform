/**
 * SortableEntryCard — draggable entry card for the EntryList page.
 *
 * Moved into @myk9/ringside in PR E2d-2b. Host coupling reduced to:
 *  - `DogCard` is now a required slot prop (was a direct host import).
 *  - `hasPermission` is now typed against ringside's narrow
 *    `EntryListPermission` union (was `keyof UserPermissions`).
 *  - `haptic` is unchanged — `@myk9/scoring-ui` is now a ringside
 *    workspace dep.
 *
 * Status badges (StatusBadge, ResetButton) are extracted as
 * sub-components below — same as the host file. Helper functions live
 * in `./sortableEntryCardUtils` and `./SortableEntryCardComponents`,
 * both already in ringside from PR E2d-2a.
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@myk9/ui';
import { haptic } from '@myk9/scoring-ui';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import { getStatusBorderClass } from './sortableEntryCardUtils';
import { ResultBadges, StatusBadgeContent } from './SortableEntryCardComponents';

// ========================================
// TYPES
// ========================================

export interface SortableEntryCardProps {
  entry: Entry;
  isDragMode: boolean;
  showContext?: {
    competition_type?: string;
  } | null;
  classInfo?: {
    selfCheckin?: boolean;
  } | null;
  /**
   * Permission predicate over the narrow EntryList-only union.
   * Host's `usePermission().hasPermission` (typed over the wider
   * `keyof UserPermissions`) satisfies this directly.
   */
  hasPermission: (permission: EntryListPermission) => boolean;
  handleEntryClick: (entry: Entry) => void;
  handleStatusClick: (e: React.MouseEvent, entryId: string) => void;
  handleResetMenuClick: (e: React.MouseEvent, entryId: string) => void;
  setSelfCheckinDisabledDialog: (value: boolean) => void;
  onPrefetch?: (entry: Entry) => void;
  /** Section badge for combined views (A/B) */
  sectionBadge?: 'A' | 'B' | null;
  /** Handler to open drag mode */
  onOpenDragMode?: () => void;
  /**
   * Host-injected card primitive. The host renders this with the
   * armband / dog details / badges; ringside controls only what's
   * passed in.
   */
  DogCard: ComponentType<DogCardProps>;
}

// ========================================
// MAIN COMPONENT
// ========================================

export const SortableEntryCard: React.FC<SortableEntryCardProps> = ({
  entry,
  isDragMode,
  showContext,
  classInfo,
  hasPermission,
  handleEntryClick,
  handleStatusClick,
  handleResetMenuClick,
  setSelfCheckinDisabledDialog,
  onPrefetch,
  sectionBadge,
  onOpenDragMode,
  DogCard,
}) => {
  const isInRing = entry.inRing || entry.status === 'in-ring';
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = React.useRef(false);
  const [isLongPressing, setIsLongPressing] = React.useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.id,
    disabled: !isDragMode || isInRing // Disable dragging when NOT in drag mode or for in-ring dogs
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Determine if self check-in is allowed
  const canCheckIn = hasPermission('canCheckInDogs');
  const isSelfCheckinEnabled = classInfo?.selfCheckin ?? true;
  const isCheckInDisabled = !canCheckIn && !isSelfCheckinEnabled;

  // Handle card click
  const handleCardClick = () => {
    if (isDragMode) return; // Disable navigation in drag mode
    if (isLongPressRef.current) return; // Ignore click if it was a long press
    if (hasPermission('canScore')) {
      haptic.medium();
      handleEntryClick(entry);
    }
  };

  // Long press handlers
  const startLongPress = React.useCallback(() => {
    if (isDragMode || !onOpenDragMode) return;

    isLongPressRef.current = false;
    setIsLongPressing(true); // Start visual feedback

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setIsLongPressing(false); // End visual feedback
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
      onOpenDragMode();
    }, 500); // 500ms long press
  }, [isDragMode, onOpenDragMode]);

  const cancelLongPress = React.useCallback(() => {
    setIsLongPressing(false); // Cancel visual feedback
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  // Handle status badge click
  const handleStatusBadgeClick = (e: React.MouseEvent) => {
    if (canCheckIn || isSelfCheckinEnabled) {
      handleStatusClick(e, entry.id);
    } else {
      e.preventDefault();
      e.stopPropagation();
      setSelfCheckinDisabledDialog(true);
    }
  };

  // Handle reset menu click
  const handleResetClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    handleResetMenuClick(e, entry.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragMode ? 'sortable-item' : ''} ${isLongPressing ? 'long-pressing' : ''}`}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onMouseDown={startLongPress}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
    >
      <DogCard
        key={entry.id}
        armband={entry.armband}
        callName={entry.callName}
        breed={entry.breed}
        handler={entry.handler}
        onClick={handleCardClick}
        onPrefetch={() => onPrefetch?.(entry)}
        className={`${hasPermission('canScore') && !entry.isScored ? 'clickable' : ''
          } ${entry.status === 'in-ring' ? 'in-ring' : ''}`}
        statusBorder={getStatusBorderClass(entry)}
        resultBadges={<ResultBadges entry={entry} showContext={showContext} />}
        sectionBadge={sectionBadge}
        dragHandle={isDragMode && !isInRing ? (
          <div {...attributes} {...listeners} className="drag-handle">
            <GripVertical size={20} />
          </div>
        ) : undefined}
        actionButton={
          !entry.isScored ? (
            <StatusBadge
              entry={entry}
              isDisabled={isCheckInDisabled}
              onClick={handleStatusBadgeClick}
            />
          ) : hasPermission('canScore') ? (
            <ResetButton onClick={handleResetClick} />
          ) : undefined
        }
      />
    </div>
  );
};

// ========================================
// EXTRACTED SUB-COMPONENTS
// ========================================

/**
 * Per-status background fill for the check-in pill. Colors resolve from the
 * host's light/dark `status-*` Tailwind group (was `.status-badge.<status>` in
 * ringside.css). Keyed on the same normalized status string the markup builds.
 */
const STATUS_PILL_BG: Record<string, string> = {
  none: 'bg-status-no-status',
  'no-status': 'bg-status-no-status',
  'checked-in': 'bg-status-checked-in',
  'at-gate': 'bg-status-at-gate',
  'come-to-gate': 'bg-status-at-gate',
  'in-ring': 'bg-status-in-ring',
  conflict: 'bg-status-conflict',
  pulled: 'bg-status-pulled',
};

/**
 * Status badge for unscored entries
 */
interface StatusBadgeProps {
  entry: Entry;
  isDisabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ entry, isDisabled, onClick }) => {
  const statusClass = entry.inRing
    ? 'in-ring'
    : (entry.status || 'none').toLowerCase().replace(' ', '-');

  // Track pulse animation state - triggers when timestamp changes
  const entryTimestamp = (entry as Entry & { _timestamp?: number })._timestamp;
  const [isAnimating, setIsAnimating] = React.useState(false);
  const prevTimestampRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    // Only animate if timestamp changed (not on initial mount)
    if (entryTimestamp && prevTimestampRef.current !== undefined && entryTimestamp !== prevTimestampRef.current) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    prevTimestampRef.current = entryTimestamp;
  }, [entryTimestamp]);

  const pulseClass = isAnimating ? 'status-just-changed' : '';

  return (
    <div
      className={cn(
        'relative inline-flex min-h-9 max-w-[140px] items-center justify-center gap-0.5 overflow-hidden text-ellipsis whitespace-nowrap rounded-bl-xl px-3 py-1 text-xs font-semibold leading-tight tracking-wider text-white transition',
        isDisabled
          ? 'cursor-not-allowed bg-muted text-muted-foreground opacity-60'
          : cn(
              STATUS_PILL_BG[statusClass] ?? 'bg-status-no-status',
              'cursor-pointer hover:-translate-y-px hover:shadow-sm active:translate-y-0'
            ),
        pulseClass
      )}
      style={{ textTransform: 'none' }}
      data-no-uppercase="true"
      onClick={onClick}
      title={isDisabled ? 'Self check-in disabled' : 'Tap to change status'}
    >
      <StatusBadgeContent status={entry.status} />
    </div>
  );
};

/**
 * Reset button for scored entries
 */
interface ResetButtonProps {
  onClick: (e: React.MouseEvent) => void;
}

const ResetButton: React.FC<ResetButtonProps> = ({ onClick }) => (
  <button
    className="reset-menu-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-bl-xl rounded-tr-2xl border-0 bg-muted px-3 text-2xl font-bold leading-none text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground active:scale-95"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    aria-label="More options"
    title="Reset score"
  >
    ⋯
  </button>
);
