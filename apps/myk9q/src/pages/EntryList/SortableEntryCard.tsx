/**
 * SortableEntryCard Component
 *
 * Draggable entry card for the entry list with status badges and result display.
 *
 * Refactored as part of DEBT-008 to reduce complexity from 64 to manageable levels.
 * Helper functions and sub-components extracted to SortableEntryCardHelpers.tsx.
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { DogCard } from '../../components/DogCard';
import { Entry } from '../../stores/entryStore';
import { UserPermissions } from '../../utils/auth';
import { getStatusBorderClass } from './sortableEntryCardUtils';
import { ResultBadges, StatusBadgeContent } from './SortableEntryCardComponents';
import { haptic } from '@/hooks/useHapticFeedback';

// ========================================
// TYPES
// ========================================

interface SortableEntryCardProps {
  entry: Entry;
  isDragMode: boolean;
  showContext?: {
    competition_type?: string;
  } | null;
  classInfo?: {
    selfCheckin?: boolean;
  } | null;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  handleEntryClick: (entry: Entry) => void;
  handleStatusClick: (e: React.MouseEvent, entryId: number) => void;
  handleResetMenuClick: (e: React.MouseEvent, entryId: number) => void;
  setSelfCheckinDisabledDialog: (value: boolean) => void;
  onPrefetch?: (entry: Entry) => void;
  /** Section badge for combined views (A/B) */
  sectionBadge?: 'A' | 'B' | null;
  /** Handler to open drag mode */
  onOpenDragMode?: () => void;
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
}) => {
  const isInRing = entry.inRing || entry.status === 'in-ring';
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
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
      className={`status-badge checkin-status ${statusClass} ${isDisabled ? 'disabled' : ''} ${pulseClass}`}
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
    className="reset-button reset-menu-button"
    onClick={onClick}
    onMouseDown={(e) => e.stopPropagation()}
    aria-label="More options"
    title="Reset score"
  >
    ⋯
  </button>
);
