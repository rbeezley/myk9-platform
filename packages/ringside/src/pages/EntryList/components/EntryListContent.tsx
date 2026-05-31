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
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  closestCenter,
  SensorDescriptor,
  SensorOptions,
  AutoScrollActivator,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableEntryCard } from '../SortableEntryCard';
import type { Entry } from '../../../stores/entryStore';
import type { EntryListPermission } from '../permissions';
import type { DogCardProps, EntryListFavorites } from '../pageProps';
import type { ClassInfo } from '../hooks/useEntryListData';

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
  /** Host-injected card primitive — passed through to SortableEntryCard. */
  DogCard: ComponentType<DogCardProps>;
}

/**
 * Shared content component for entry list grid with drag-and-drop support.
 * Used by both EntryListPage and CombinedEntryListPage.
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
      <SortableContext items={entries.map(e => e.id)} strategy={verticalListSortingStrategy}>
        <div
          className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 lg:gap-5 ${isAnimating ? 'stagger-children' : 'stagger-pending'} ${isDragMode ? 'drag-mode' : ''}`}
        >
          {entries.map(entry => (
            <SortableEntryCard
              key={`${entry.id}-${entry.status}-${entry.isScored}`}
              entry={entry}
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
              {...(favorites
                ? {
                    isFavorite: favorites.favoriteArmbands.has(entry.armband),
                    onToggleFavorite: favorites.onToggleFavoriteArmband,
                  }
                : {})}
              DogCard={DogCard}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default EntryListContent;
