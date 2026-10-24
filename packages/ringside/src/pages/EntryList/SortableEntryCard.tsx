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
 * This file is the sortable SHELL: the dnd-kit registration, the drag
 * transform and the long-press gesture. The card content is
 * `SortableEntryCardBody`, memoised so the shell's re-renders (dnd-kit
 * updates every `useSortable` consumer when the hovered slot changes) stop
 * at that boundary (MYK9-1365). The shell itself is memoised with
 * `areSortableEntryCardPropsEqual`, so a list refresh that rebuilds every
 * entry object renders only the cards whose entry actually changed.
 *
 * Status badges (StatusBadge, ResetButton) live in `./SortableEntryCardBadges`;
 * helper functions in `./sortableEntryCardUtils` and
 * `./SortableEntryCardComponents`.
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import type { DogsAheadResult } from './dogsAheadInList';
import { SortableEntryCardBody } from './SortableEntryCardBody';
import { areSortableEntryCardPropsEqual } from './sortableEntryCardMemo';

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
    /** Registry id for ribbon colours (MYK9-1086). */
    registry?: string;
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
  /** Whether this armband is one of the exhibitor's favorites. */
  isFavorite?: boolean;
  /** Toggle the exhibitor's favorite state for this armband. */
  onToggleFavorite?: (armband: number) => void;
  /** Whether this entry belongs to the signed-in exhibitor (own-dog highlight). */
  isOwnEntry?: boolean;
  /** Live queue position for an own entry; renders the "N dogs ahead" pill. */
  dogsAhead?: DogsAheadResult;
  /** Ring-conflict annotation for an own entry ("Also 2 away in ..."). */
  conflictLabel?: string | null;
  /**
   * Suppress every scoring affordance on this card (MYK9-645).
   *
   * Set for rows in the "Not running" group: a withdrawn or pulled dog still
   * offered a live Score button, and a score saved from there vanished into a
   * collapsed group and moved neither badge. The status chip stays, so the
   * existing check-in flow remains the one way back — no new action is added.
   */
  scoringDisabled?: boolean;
  /** Render as the in-ring hero or the up-next card (MYK9-1086). */
  variant?: 'hero' | 'next';
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

const SortableEntryCardImpl: React.FC<SortableEntryCardProps> = ({
  entry,
  scoringDisabled = false,
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
  isFavorite = false,
  onToggleFavorite,
  isOwnEntry = false,
  dogsAhead = null,
  conflictLabel = null,
  variant,
  DogCard,
}) => {
  const isInRing = entry.inRing || entry.status === 'in-ring';
  const longPressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = React.useRef(false);
  const [isLongPressing, setIsLongPressing] = React.useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: !isDragMode || isInRing, // Disable dragging when NOT in drag mode or for in-ring dogs
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
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
      <SortableEntryCardBody
        entry={entry}
        isDragMode={isDragMode}
        scoringDisabled={scoringDisabled}
        showContext={showContext}
        classInfo={classInfo}
        hasPermission={hasPermission}
        handleEntryClick={handleEntryClick}
        handleStatusClick={handleStatusClick}
        handleResetMenuClick={handleResetMenuClick}
        setSelfCheckinDisabledDialog={setSelfCheckinDisabledDialog}
        onPrefetch={onPrefetch}
        sectionBadge={sectionBadge}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        isOwnEntry={isOwnEntry}
        dogsAhead={dogsAhead}
        conflictLabel={conflictLabel}
        variant={variant}
        DogCard={DogCard}
        isLongPressRef={isLongPressRef}
        attributes={attributes}
        listeners={listeners}
      />
    </div>
  );
};

export const SortableEntryCard = React.memo(SortableEntryCardImpl, areSortableEntryCardPropsEqual);
