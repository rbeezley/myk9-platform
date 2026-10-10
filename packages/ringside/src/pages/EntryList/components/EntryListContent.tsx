/**
 * EntryListContent — drag-and-drop grid wrapper around SortableEntryCard.
 *
 * Moved into @myk9/ringside in PR E2d-2b. Host coupling reduced to:
 *  - `DogCard` is now a required slot prop (passed through to
 *    SortableEntryCard).
 *  - `hasPermission` is now typed against ringside's narrow
 *    `EntryListPermission` union.
 *
 * The drag-and-drop wiring (DndContext, SortableContext, sensors) is
 * unchanged — the page owns the sensors + handlers and threads them
 * here; this component just renders the DnD scaffolding.
 */

import React from 'react';
import type { ComponentType } from 'react';
import { Target } from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  SensorDescriptor,
  SensorOptions,
  AutoScrollActivator,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { SortableEntryCard } from '../SortableEntryCard';
import type { Entry } from '../../../stores/entryStore';
import type { EntryListPermission } from '../permissions';
import type { DogCardProps, EntryListFavorites, EntryListOwnership } from '../pageProps';
import type { ClassInfo } from '../hooks/useEntryListData';
import { isInRingEntry, pendingByRunOrder } from '../runQueue';

export interface EntryListContentProps {
  /** Filtered and sorted entries to display */
  entries: Entry[];
  /** Current active tab for empty state message */
  activeTab: 'pending' | 'completed';
  /** Whether drag mode is active */
  isDragMode: boolean;
  /** Show context for competition type */
  showContext?: {
    competition_type?: string;
  } | null;
  /** Class info for self-checkin setting */
  classInfo?: ClassInfo | null;
  /** Permission checker over the narrow EntryList-only union */
  hasPermission: (permission: EntryListPermission) => boolean;
  /** Handler for entry click (scoresheet navigation) */
  onEntryClick: (entry: Entry) => void;
  /** Handler for status badge click */
  onStatusClick: (e: React.MouseEvent, entryId: string) => void;
  /** Handler for reset menu click */
  onResetMenuClick: (e: React.MouseEvent, entryId: string) => void;
  /** Handler for showing self-checkin disabled dialog */
  onSelfCheckinDisabled: () => void;
  /** Handler for prefetch on hover */
  onPrefetch?: (entry: Entry) => void;
  /** Whether to show section badges (for combined view) */
  showSectionBadges?: boolean;
  /** DnD sensors */
  sensors: SensorDescriptor<SensorOptions>[];
  /** DnD drag start handler */
  onDragStart: (event: DragStartEvent) => void;
  /** DnD drag end handler */
  onDragEnd: (event: DragEndEvent) => Promise<void>;
  /** Handler to open drag mode (long press) */
  onOpenDragMode?: () => void;
  /** Optional exhibitor dog-favorite state for notification fanout */
  favorites?: EntryListFavorites;
  /** Optional ownership annotations (own-dog highlight + dogs-ahead pills). */
  ownership?: EntryListOwnership;
  /**
   * Render every card with its scoring affordances suppressed (MYK9-645).
   * Used for the "Not running" group: those dogs are visible, not scorable.
   */
  scoringDisabled?: boolean;
  /**
   * Lift the dog in the ring and the next dog to run into cards above the list
   * (MYK9-1086). The page turns this off for drag mode and while searching.
   */
  showNowAndNext?: boolean;
  /** Host-injected card primitive — passed through to SortableEntryCard. */
  DogCard: ComponentType<DogCardProps>;
}

/**
 * Shared content component for entry list grid with drag-and-drop support.
 * Used by both of EntryListPage's modes (single class and combined A/B).
 */
export const EntryListContent: React.FC<EntryListContentProps> = ({
  entries,
  activeTab,
  isDragMode,
  showContext,
  classInfo,
  hasPermission,
  onEntryClick,
  onStatusClick,
  onResetMenuClick,
  onSelfCheckinDisabled,
  onPrefetch,
  showSectionBadges = false,
  sensors,
  onDragStart,
  onDragEnd,
  onOpenDragMode,
  favorites,
  ownership,
  scoringDisabled = false,
  showNowAndNext = false,
  DogCard,
}) => {
  // Track when entries first load to trigger stagger animation
  // Start with pending state (hidden), then switch to animating (stagger-in plays)
  const [isAnimating, setIsAnimating] = React.useState(false);
  const hasAnimatedRef = React.useRef(false);

  React.useEffect(() => {
    // Only trigger animation on first load of entries (not on subsequent updates)
    if (entries.length > 0 && !hasAnimatedRef.current) {
      hasAnimatedRef.current = true;
      // Double RAF ensures DOM is fully painted before animation class is added
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true);
        });
      });
    }
  }, [entries.length]);

  const inRing = showNowAndNext ? (entries.find(isInRingEntry) ?? null) : null;
  const upNext = showNowAndNext ? (pendingByRunOrder(entries)[0] ?? null) : null;
  const listEntries = showNowAndNext
    ? entries.filter(entry => entry.id !== inRing?.id && entry.id !== upNext?.id)
    : entries;

  const renderCard = (entry: Entry, variant?: 'hero' | 'next') => (
    <SortableEntryCard
      key={`${entry.id}-${entry.status}-${entry.isScored}`}
      entry={entry}
      scoringDisabled={scoringDisabled}
      isDragMode={isDragMode}
      showContext={showContext}
      classInfo={classInfo}
      hasPermission={hasPermission}
      handleEntryClick={onEntryClick}
      handleStatusClick={onStatusClick}
      handleResetMenuClick={onResetMenuClick}
      setSelfCheckinDisabledDialog={onSelfCheckinDisabled}
      onPrefetch={onPrefetch}
      sectionBadge={showSectionBadges ? (entry.section as 'A' | 'B' | null) : undefined}
      onOpenDragMode={onOpenDragMode}
      {...(variant ? { variant } : {})}
      {...(favorites
        ? {
            isFavorite: entry.armband != null && favorites.favoriteArmbands.has(entry.armband),
            onToggleFavorite: favorites.onToggleFavoriteArmband,
          }
        : {})}
      {...(ownership?.ownEntryIds.has(entry.id)
        ? {
            isOwnEntry: true,
            dogsAhead: ownership.dogsAheadByEntryId.get(entry.id) ?? null,
            conflictLabel: ownership.conflictLabelByEntryId?.get(entry.id) ?? null,
          }
        : {})}
      DogCard={DogCard}
    />
  );
  const sectionLabel = (text: string) => (
    <h3 className="mb-2 mt-1 px-1 text-sm font-semibold text-muted-foreground">{text}</h3>
  );

  if (entries.length === 0) {
    return (
      <div className="px-3 py-8 text-center text-muted-foreground">
        <h2>No {activeTab} entries</h2>
        <p>
          {activeTab === 'pending'
            ? 'All entries have been scored.'
            : 'No entries have been scored yet.'}
        </p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      autoScroll={{
        // Enable scrolling as soon as dragging starts (not just when pointer near edge)
        activator: AutoScrollActivator.Pointer,
        // Start scrolling when within 100px of edge (more generous than default)
        threshold: { x: 0, y: 0.15 },
        // Faster acceleration for quicker scrolling to end of long lists
        acceleration: 15,
        // More frequent scroll updates for smoother experience
        interval: 5,
      }}
    >
      {/* rectSortingStrategy, NOT verticalListSortingStrategy: the container is
          `grid-cols-1 md:grid-cols-2` (MYK9-1086; was sm:2 lg:3), and the vertical strategy
          assumes single-column stacking. Above 640px -- a phone in landscape at
          ringside, or any tablet -- it computed drop previews and translate
          offsets against the wrong axis, so cards jumped to visibly wrong slots
          and reorder was unusable on every layout except one column. */}
      <SortableContext items={entries.map(e => e.id)} strategy={rectSortingStrategy}>
        {showNowAndNext && (
          <div className="mb-4 flex flex-col">
            {sectionLabel('In the ring')}
            {inRing ? (
              renderCard(inRing, 'hero')
            ) : (
              // As tall as the hero card it stands in for (168px measured live at 375px):
              // at 70px, every dog leaving and entering the ring shifted the whole list
              // ~100px up and back, which read as the page bouncing (owner, 2026-10-09).
              <div
                className="flex min-h-[10.5rem] items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.05] p-3"
                data-testid="ring-clear"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-dashed border-primary/40 text-primary">
                  <Target size={22} aria-hidden="true" />
                </div>
                <div>
                  <p className="text-base font-bold text-primary">Ring is clear</p>
                  <p className="text-sm text-primary/80">Waiting for the next dog</p>
                </div>
              </div>
            )}
            {upNext && (
              <>
                <div className="mt-4">{sectionLabel('Up next')}</div>
                {renderCard(upNext, 'next')}
              </>
            )}
            {listEntries.length > 0 && <div className="mt-4">{sectionLabel('Then')}</div>}
          </div>
        )}
        <div
          className={`grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 ${isAnimating ? 'stagger-children' : 'stagger-pending'} ${isDragMode ? 'drag-mode' : ''}`}
        >
          {listEntries.map(entry => renderCard(entry))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default EntryListContent;
