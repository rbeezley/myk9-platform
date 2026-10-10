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
import { GripVertical, Heart } from 'lucide-react';
import { cn } from '@myk9/ui';
import { haptic } from '@myk9/scoring-ui';
import type { ComponentType } from 'react';
import type { Entry } from '../../stores/entryStore';
import { formatArmband } from '../../utils/armband';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import { isNationalsCompetition } from './sortableEntryCardUtils';
import { ResultBadges } from './SortableEntryCardComponents';
import { formatDogsAheadInList, type DogsAheadResult } from './dogsAheadInList';
import { CheckInIndicator, getCheckInPresentation } from './CheckInIndicator';
import { CompletedResult } from './CompletedResult';

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

export const SortableEntryCard: React.FC<SortableEntryCardProps> = ({
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

  // Determine if self check-in is allowed
  const canCheckIn = hasPermission('canCheckInDogs');
  const isSelfCheckinEnabled = classInfo?.selfCheckin ?? true;
  const isCheckInDisabled = !canCheckIn && !isSelfCheckinEnabled;

  // Scoring is a permission AND a property of the row: a dog the show no longer
  // expects to run has nothing to score (MYK9-645).
  const scoringAllowed = hasPermission('canScore') && !scoringDisabled;

  // Handle card click
  const handleCardClick = () => {
    if (isDragMode) return; // Disable navigation in drag mode
    if (isLongPressRef.current) return; // Ignore click if it was a long press
    if (scoringAllowed) {
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

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    haptic.light();
    // Favorites are keyed by armband; an entry with none cannot be favorited.
    if (entry.armband != null) onToggleFavorite?.(entry.armband);
  };

  const stopCardGesture = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
  };

  // MYK9-1086: the result replaces the badge strip on a scored row, except at
  // Nationals, whose per-area badges have no compact form yet.
  const isNationals = isNationalsCompetition(showContext);
  const showStatus = !entry.isScored || scoringDisabled;
  // The judge's NQ/excused reason is for the ring and the dog's own team, not
  // every exhibitor reading the list (MYK9-1086 review).
  const canSeeReason = hasPermission('canScore') || hasPermission('canManageClasses') || isOwnEntry;
  const result = (
    <CompletedResult
      entry={entry}
      registry={classInfo?.registry ?? null}
      showReason={canSeeReason}
    />
  );
  const actionPill = (label: string) => (
    <span
      className={cn(
        'inline-flex min-h-11 items-center rounded-xl px-4 text-[0.9375rem] font-bold',
        // Hero pill: fixed dark text on white so it reads in both themes.
        variant === 'hero' ? 'bg-white text-neutral-900' : 'bg-primary text-primary-foreground'
      )}
    >
      {label}
    </span>
  );
  const trailing =
    variant === 'hero' ? (
      <>
        {/* The ring steward can still correct an in-ring dog's status from here. */}
        <StatusBadge
          entry={entry}
          isDisabled={isCheckInDisabled}
          onClick={handleStatusBadgeClick}
          inverse
        />
        {scoringAllowed && actionPill('Resume')}
      </>
    ) : variant === 'next' ? (
      <>
        <StatusBadge
          entry={entry}
          isDisabled={isCheckInDisabled}
          onClick={handleStatusBadgeClick}
        />
        {isOwnEntry && <OwnDogQueuePill dogsAhead={dogsAhead} />}
        {scoringAllowed && actionPill('Time')}
      </>
    ) : showStatus ? (
      <>
        {/* A dog scored and then moved to Not running keeps its result visible. */}
        {entry.isScored && !isNationals && result}
        <StatusBadge
          entry={entry}
          isDisabled={isCheckInDisabled}
          onClick={handleStatusBadgeClick}
        />
        {isOwnEntry && <OwnDogQueuePill dogsAhead={dogsAhead} />}
      </>
    ) : (
      <>
        {!isNationals && result}
        {scoringAllowed && <ResetButton onClick={handleResetClick} callName={entry.callName} />}
      </>
    );

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
        className={cn(
          scoringAllowed && !entry.isScored && 'clickable',
          entry.status === 'in-ring' && 'in-ring',
          // Own-dog highlight: calm primary ring + faint tint. Layered via
          // className so the DogCard primitive's API stays untouched.
          // Not on the hero: its solid fill must win, or the white text vanishes.
          isOwnEntry &&
            variant !== 'hero' &&
            'ring-1 ring-primary/50 border-primary/40 bg-primary/[0.06]'
        )}
        nameAddon={
          isOwnEntry ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">
              Your dog
            </span>
          ) : undefined
        }
        trailing={trailing}
        {...(variant ? { variant } : {})}
        resultBadges={
          (isOwnEntry && conflictLabel) || isNationals ? (
            <>
              {isOwnEntry && conflictLabel && <OwnDogConflictChip label={conflictLabel} />}
              {isNationals && <ResultBadges entry={entry} showContext={showContext} />}
            </>
          ) : undefined
        }
        sectionBadge={sectionBadge}
        favoriteButton={
          // A scorer's tap opens the scoresheet; the heart is an exhibitor
          // control and only crowds the judge's row (MYK9-1086).
          onToggleFavorite && !hasPermission('canScore') ? (
            <button
              type="button"
              aria-label={`Favorite ${entry.callName}`}
              aria-pressed={isFavorite}
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-full border border-solid border-border bg-card/95 text-muted-foreground shadow-sm transition active:scale-95',
                isFavorite && 'border-rose-200 bg-rose-50 text-rose-600'
              )}
              onClick={handleFavoriteClick}
              onMouseDown={stopCardGesture}
              onTouchStart={stopCardGesture}
            >
              <Heart
                size={19}
                className={cn('transition', isFavorite && 'fill-current')}
                aria-hidden="true"
              />
            </button>
          ) : undefined
        }
        dragHandle={
          isDragMode && !isInRing ? (
            // dnd-kit's `attributes` supply role="button", tabIndex and
            // aria-roledescription="sortable" but NO accessible name, so this
            // announced as "button, sortable" with no indication of which dog.
            // `.drag-handle` also has no CSS since the Tailwind migration, and
            // there was no focus ring, so a keyboard user reordering with arrow
            // keys could not see which handle was focused.
            <div
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${entry.callName}, armband ${formatArmband(entry.armband)}`}
              className="inline-flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVertical size={20} aria-hidden="true" />
            </div>
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
  /** Draw on the solid primary hero card. */
  inverse?: boolean;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ entry, isDisabled, onClick, inverse }) => {
  const displayStatus = entry.inRing ? 'in-ring' : entry.status;

  // Track pulse animation state - triggers when timestamp changes
  const entryTimestamp = (entry as Entry & { _timestamp?: number })._timestamp;
  const [isAnimating, setIsAnimating] = React.useState(false);
  const prevTimestampRef = React.useRef<number | undefined>(undefined);

  React.useEffect(() => {
    // Only animate if timestamp changed (not on initial mount)
    if (
      entryTimestamp &&
      prevTimestampRef.current !== undefined &&
      entryTimestamp !== prevTimestampRef.current
    ) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 500);
      return () => clearTimeout(timer);
    }
    prevTimestampRef.current = entryTimestamp;
  }, [entryTimestamp]);

  const pulseClass = isAnimating ? 'status-just-changed' : '';

  return (
    // A <button>, not a <div onClick>. This is the most-used steward control on
    // the surface and it had no role, no tabIndex and no key handler, so a
    // keyboard or switch-control user could not change a dog's check-in status
    // at all, and a screen reader announced it as static text.
    //
    // `aria-disabled` rather than the `disabled` attribute ON PURPOSE: when
    // self check-in is off, clicking is what opens the dialog EXPLAINING that
    // (handleStatusBadgeClick). A truly disabled button would swallow the click
    // and leave the steward with a greyed pill and no explanation.
    <button
      type="button"
      aria-disabled={isDisabled}
      aria-label={`Check-in: ${getCheckInPresentation(displayStatus).label}. ${isDisabled ? 'Self check-in disabled' : 'Change check-in'} for ${entry.callName}`}
      className={cn(
        // min-h-11 = 44px INTENT touch-target floor — stewards tap this
        // outdoors, often gloved; do not shrink it back for visual density.
        'relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1.5 transition',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isDisabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-muted active:scale-95',
        pulseClass
      )}
      data-testid="check-in-button"
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      title={isDisabled ? 'Self check-in disabled' : 'Change check-in'}
    >
      <CheckInIndicator status={displayStatus} inverse={inverse} />
    </button>
  );
};

/**
 * Queue-position pill for the exhibitor's own entries ("You're next",
 * "3 dogs ahead"). Persistent counterpart of the notification monitor's
 * transient "your turn" toast — same facts, glanceable on the list.
 * Renders nothing once the entry is scored (dogsAhead === null).
 */
const OwnDogQueuePill: React.FC<{ dogsAhead: DogsAheadResult }> = ({ dogsAhead }) => {
  const label = formatDogsAheadInList(dogsAhead);
  if (label === null) return null;

  const emphasis =
    dogsAhead?.kind === 'in-ring' || (dogsAhead?.kind === 'waiting' && dogsAhead.dogsAhead === 0);

  return (
    <span
      data-testid="own-dog-queue-pill"
      className={cn(
        'whitespace-nowrap text-sm font-bold text-primary',
        emphasis && 'rounded-full bg-primary px-2 py-0.5 text-primary-foreground'
      )}
    >
      {label}
    </span>
  );
};

/**
 * Ring-conflict chip for the exhibitor's own entries. Informational only —
 * marking `check_in_status='conflict'` stays a human action via the status
 * dialog. Amber, calm, no animation.
 */
const OwnDogConflictChip: React.FC<{ label: string }> = ({ label }) => (
  <span
    data-testid="own-dog-conflict-chip"
    className="inline-flex items-center gap-1 rounded-full border border-solid border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400"
  >
    {label}
  </span>
);

/**
 * Reset button for scored entries
 */
interface ResetButtonProps {
  onClick: (e: React.MouseEvent) => void;
  /** Named so the control is distinguishable in a list of identical glyphs. */
  callName: string;
}

const ResetButton: React.FC<ResetButtonProps> = ({ onClick, callName }) => (
  <button
    // The label used to be "More options" while the tooltip said "Reset score" —
    // the announced name and the visible hint disagreed about what the control
    // does, on a button whose only visible content is "⋯". It also had no
    // focus-visible treatment, unlike the primary action beside it.
    className="reset-menu-button inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border-0 bg-muted px-3 text-2xl font-bold leading-none text-muted-foreground shadow-sm transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:scale-95 sm:min-h-12 sm:min-w-12"
    data-testid="reset-menu-button"
    onClick={onClick}
    onMouseDown={e => e.stopPropagation()}
    aria-label={`Score options for ${callName}`}
    title="Score options"
  >
    <span aria-hidden="true">⋯</span>
  </button>
);
