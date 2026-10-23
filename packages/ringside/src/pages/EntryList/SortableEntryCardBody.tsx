/**
 * SortableEntryCardBody — the card content under the sortable shell.
 *
 * Split from SortableEntryCard (MYK9-1365). dnd-kit's `useSortable` subscribes
 * its caller to the sortable context, so the shell re-renders whenever the
 * hovered slot changes mid-drag, on every card in the list. Everything that
 * costs anything to render (DogCard, badges, result) lives here, memoised on
 * stable props, so those shell renders stop at this boundary.
 */

import React from 'react';
import { GripVertical, Heart } from 'lucide-react';
import { cn } from '@myk9/ui';
import { haptic } from '@myk9/scoring-ui';
import type { ComponentType } from 'react';
import type { useSortable } from '@dnd-kit/sortable';
import type { Entry } from '../../stores/entryStore';
import { formatArmband } from '../../utils/armband';
import type { DogCardProps } from './pageProps';
import type { EntryListPermission } from './permissions';
import { isNationalsCompetition } from './sortableEntryCardUtils';
import { ResultBadges } from './SortableEntryCardComponents';
import type { DogsAheadResult } from './dogsAheadInList';
import { CompletedResult } from './CompletedResult';
import {
  OwnDogConflictChip,
  OwnDogQueuePill,
  ResetButton,
  StatusBadge,
} from './SortableEntryCardBadges';

type SortableHandle = ReturnType<typeof useSortable>;

export interface SortableEntryCardBodyProps {
  entry: Entry;
  isDragMode: boolean;
  scoringDisabled: boolean;
  showContext?: { competition_type?: string } | null;
  classInfo?: { selfCheckin?: boolean; registry?: string } | null;
  hasPermission: (permission: EntryListPermission) => boolean;
  handleEntryClick: (entry: Entry) => void;
  handleStatusClick: (e: React.MouseEvent, entryId: string) => void;
  handleResetMenuClick: (e: React.MouseEvent, entryId: string) => void;
  setSelfCheckinDisabledDialog: (value: boolean) => void;
  onPrefetch?: ((entry: Entry) => void) | undefined;
  sectionBadge?: 'A' | 'B' | null | undefined;
  isFavorite: boolean;
  onToggleFavorite?: ((armband: number) => void) | undefined;
  isOwnEntry: boolean;
  dogsAhead: DogsAheadResult;
  conflictLabel: string | null;
  variant?: 'hero' | 'next' | undefined;
  DogCard: ComponentType<DogCardProps>;
  /** Set by the shell's long press; a click that ends one must not navigate. */
  isLongPressRef: { current: boolean };
  /** dnd-kit's handle props; stable between renders for a card that is not being dragged. */
  attributes: SortableHandle['attributes'];
  listeners: SortableHandle['listeners'];
}

const SortableEntryCardBodyImpl: React.FC<SortableEntryCardBodyProps> = ({
  entry,
  scoringDisabled,
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
  isFavorite,
  onToggleFavorite,
  isOwnEntry,
  dogsAhead,
  conflictLabel,
  variant,
  DogCard,
  isLongPressRef,
  attributes,
  listeners,
}) => {
  const isInRing = entry.inRing || entry.status === 'in-ring';
  // MYK9-1162: a held entry (no registration number for the trial's registry)
  // keeps its run-order place but cannot be timed or scored until the secretary
  // adds the number. The card stays tappable: the scoresheet route explains the
  // lock and still lets the judge record the dog ABSENT, which the server
  // allows. The server decides (`awaitingRegistrationNumber`); unknown is not
  // held, and the server refuses a locked write regardless.
  const awaitingRegistration = entry.awaitingRegistrationNumber === true && !entry.isScored;

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
  // The row tap is the scoring action. Keyboard and switch-control users get a
  // real button for it, hidden until it is focused, so the card looks the same
  // and no button is nested inside another (MYK9-1086 review).
  const keyboardScoreButton = scoringAllowed && !entry.isScored && !isDragMode && (
    <button
      type="button"
      className={cn(
        // focus:px/py because not-sr-only resets padding at higher specificity.
        'sr-only whitespace-nowrap rounded-lg text-sm font-bold focus:not-sr-only focus:px-3 focus:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        // On the solid hero, invert so the focused control stays visible.
        variant === 'hero'
          ? 'bg-white text-neutral-900 focus-visible:ring-white'
          : 'bg-primary text-primary-foreground focus-visible:ring-ring'
      )}
      onClick={e => {
        e.stopPropagation();
        // Direct, not via handleCardClick: a prior long press on the row
        // leaves isLongPressRef set and would swallow this activation.
        haptic.medium();
        handleEntryClick(entry);
      }}
      onMouseDown={stopCardGesture}
      onTouchStart={stopCardGesture}
    >
      {awaitingRegistration ? 'Open' : 'Score'} {entry.callName}
    </button>
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
  const registrationNotice = awaitingRegistration && (
    <span
      role="note"
      className={cn(
        'inline-flex flex-col rounded-lg border px-2 py-1 text-xs font-semibold leading-tight',
        variant === 'hero'
          ? 'border-white/60 bg-white/10 text-white'
          : 'border-warning/40 bg-warning/10 text-warning'
      )}
    >
      <span>Registration number needed</span>
      <span className="font-normal">See the secretary</span>
    </span>
  );
  const baseTrailing =
    variant === 'hero' ? (
      <>
        {/* The ring steward can still correct an in-ring dog's status from here. */}
        <StatusBadge
          entry={entry}
          isDisabled={isCheckInDisabled}
          onClick={handleStatusBadgeClick}
          inverse
        />
        {scoringAllowed && !awaitingRegistration && actionPill('Resume')}
        {keyboardScoreButton}
      </>
    ) : variant === 'next' ? (
      <>
        <StatusBadge
          entry={entry}
          isDisabled={isCheckInDisabled}
          onClick={handleStatusBadgeClick}
        />
        {isOwnEntry && <OwnDogQueuePill dogsAhead={dogsAhead} />}
        {scoringAllowed && !awaitingRegistration && actionPill('Time')}
        {keyboardScoreButton}
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
        {keyboardScoreButton}
      </>
    ) : (
      <>
        {!isNationals && result}
        {scoringAllowed && <ResetButton onClick={handleResetClick} callName={entry.callName} />}
      </>
    );
  const trailing = awaitingRegistration ? (
    <>
      {registrationNotice}
      {baseTrailing}
    </>
  ) : (
    baseTrailing
  );

  return (
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
  );
};

export const SortableEntryCardBody = React.memo(SortableEntryCardBodyImpl);
