/**
 * useDragAndDropEntries Hook
 *
 * Shared hook for drag-and-drop reordering of entries.
 * Used by both EntryList and CombinedEntryList.
 *
 * Features:
 * - Drag protection: Prevents sync-triggered refreshes during drag
 * - Optimistic updates: Immediate UI feedback
 * - Database sync: Persists order to exhibitor_order field
 * - In-ring protection: Prevents moving entries before in-ring dogs
 */

import { useRef, useCallback, useState } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Entry } from '../../../stores/entryStore';
import { updateExhibitorOrder } from '../../../services/entryService';
import { logger } from '@/utils/logger';

interface UseDragAndDropEntriesOptions {
  /** All local entries (for merging after drag) */
  localEntries: Entry[];
  /** Setter for local entries state */
  setLocalEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  /** Current filtered/sorted entries being displayed (used for drag calculations) */
  currentEntries: Entry[];
  /** External isDraggingRef - if provided, hook uses it instead of creating its own */
  isDraggingRef?: React.MutableRefObject<boolean>;
  /** External manualOrder state setter - if provided, hook updates it instead of internal state */
  setManualOrder?: React.Dispatch<React.SetStateAction<Entry[]>>;
  /** Grace period in ms before accepting new sync data after drag (default: 1500) */
  gracePeriodMs?: number;
}

interface UseDragAndDropEntriesReturn {
  /** DnD-kit sensors configuration */
  sensors: ReturnType<typeof useSensors>;
  /** Handler for drag start event */
  handleDragStart: (event: DragStartEvent) => void;
  /** Handler for drag end event */
  handleDragEnd: (event: DragEndEvent) => Promise<void>;
  /** Whether a database update is in progress */
  isUpdatingOrder: boolean;
  /** Whether currently dragging (for external use) */
  isDragging: boolean;
  /** Ref to check drag state (for sync protection) */
  isDraggingRef: React.MutableRefObject<boolean>;
}

/**
 * Custom hook for drag-and-drop entry reordering
 *
 * Handles:
 * - DnD-kit sensor configuration (pointer + keyboard)
 * - Drag start: Captures snapshot to prevent race conditions
 * - Drag end: Optimistic update + database sync
 * - Grace period: Prevents sync data from reverting UI after drag
 *
 * @example
 * ```tsx
 * // In EntryList.tsx
 * const {
 *   sensors,
 *   handleDragStart,
 *   handleDragEnd,
 *   manualOrder,
 *   isDraggingRef
 * } = useDragAndDropEntries({
 *   localEntries,
 *   setLocalEntries,
 *   currentEntries: pendingEntries
 * });
 *
 * // In render
 * <DndContext
 *   sensors={sensors}
 *   onDragStart={handleDragStart}
 *   onDragEnd={handleDragEnd}
 * >
 *   <SortableContext items={currentEntries.map(e => e.id)}>
 *     {currentEntries.map(entry => <SortableEntryCard ... />)}
 *   </SortableContext>
 * </DndContext>
 * ```
 */
export function useDragAndDropEntries({
  localEntries,
  setLocalEntries,
  currentEntries,
  isDraggingRef: externalIsDraggingRef,
  setManualOrder: externalSetManualOrder,
  gracePeriodMs = 1500
}: UseDragAndDropEntriesOptions): UseDragAndDropEntriesReturn {
  // Drag state refs - prevent race conditions with sync
  const dragSnapshotRef = useRef<Entry[] | null>(null);
  const internalIsDraggingRef = useRef<boolean>(false);
  // Use external ref if provided, otherwise use internal
  const isDraggingRef = externalIsDraggingRef || internalIsDraggingRef;

  // Internal manual order state (only used if no external setter provided)
  const [_internalManualOrder, setInternalManualOrder] = useState<Entry[]>([]);
  // Use external setter if provided, otherwise use internal
  const setManualOrder = externalSetManualOrder || setInternalManualOrder;

  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Configure DnD-kit sensors
  const sensors = useSensors(
    // Mouse/trackpad support
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    // Touch/mobile support with long-press activation
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,      // 250ms long-press to activate drag
        tolerance: 5,    // Allow 5px of movement during long-press
      },
    }),
    // Keyboard accessibility
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /**
   * Handle drag start - Snapshot the array to prevent race conditions
   */
  const handleDragStart = useCallback((_event: DragStartEvent) => {
    // Set dragging flag to prevent sync-triggered refreshes
    isDraggingRef.current = true;
    setIsDragging(true);

    // Haptic feedback for mobile devices
    if ('vibrate' in navigator) {
      navigator.vibrate(50); // Short 50ms vibration
    }

    // Capture the current state at drag start - this won't change during the drag
    dragSnapshotRef.current = [...currentEntries];
  }, [currentEntries, isDraggingRef]);

  /**
   * Handle drag end - Uses snapshot for stable index calculations
   */
  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    // Use the snapshot we captured at drag start
    const snapshot = dragSnapshotRef.current;

    // Clear the snapshot (but keep isDraggingRef true until DB update completes)
    dragSnapshotRef.current = null;

    // Must have a valid drop target and snapshot
    if (!over || active.id === over.id || !snapshot) {
      isDraggingRef.current = false;
      setIsDragging(false);
      return;
    }

    // Find indices in the SNAPSHOT (stable, won't have changed during drag)
    const oldIndex = snapshot.findIndex(entry => entry.id === active.id);
    const targetIndex = snapshot.findIndex(entry => entry.id === over.id);

    if (oldIndex === -1 || targetIndex === -1) {
      isDraggingRef.current = false;
      setIsDragging(false);
      return;
    }

    // Prevent moving dogs before in-ring dogs
    const inRingDogs = snapshot.filter(e => e.inRing || e.status === 'in-ring');
    if (inRingDogs.length > 0 && targetIndex === 0) {
      const draggedEntry = snapshot[oldIndex];
      if (!draggedEntry.inRing && draggedEntry.status !== 'in-ring') {
        isDraggingRef.current = false;
        setIsDragging(false);
        return;
      }
    }

    // Create new reordered array from the snapshot
    const reorderedEntries = arrayMove(snapshot, oldIndex, targetIndex);

    // Update exhibitor_order values locally
    const entriesWithNewOrder = reorderedEntries.map((entry, index) => ({
      ...entry,
      exhibitorOrder: index + 1
    }));

    // Merge reordered entries back into localEntries (preserving entries not in current view)
    const reorderedIds = new Set(entriesWithNewOrder.map(e => e.id));
    const otherEntries = localEntries.filter(entry => !reorderedIds.has(entry.id));
    const newAllEntries = [...otherEntries, ...entriesWithNewOrder];

    // Single atomic state update for smooth UX
    setLocalEntries(newAllEntries);
    setManualOrder(entriesWithNewOrder);

    // Update database and AWAIT it to prevent race conditions with sync
    setIsUpdatingOrder(true);
    try {
      await updateExhibitorOrder(entriesWithNewOrder);
    } catch (error) {
      logger.error('Failed to update run order in database:', error);
      // The optimistic update already happened, so UI shows new order
      // If offline, the sync will happen later
    } finally {
      setIsUpdatingOrder(false);
      // IMPORTANT: Add a grace period before accepting new sync data
      // The updateExhibitorOrder triggers triggerImmediateEntrySync which can
      // arrive after we return here. Delay clearing the flag to let syncs settle.
      setTimeout(() => {
        isDraggingRef.current = false;
        setIsDragging(false);
        // Scroll back to top after drag completes for better UX
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, gracePeriodMs);
    }
  }, [localEntries, setLocalEntries, setManualOrder, isDraggingRef, gracePeriodMs]);

  return {
    sensors,
    handleDragStart,
    handleDragEnd,
    isUpdatingOrder,
    isDragging,
    isDraggingRef
  };
}
