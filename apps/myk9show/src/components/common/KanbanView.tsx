/**
 * KanbanView — Generic Kanban board for browse pages.
 *
 * Renders items grouped by a status/stage field into draggable columns.
 * Uses @dnd-kit for drag-and-drop between columns with visual feedback.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---- Types ----

export interface KanbanColumn<TStatus extends string = string> {
  key: TStatus;
  label: string;
  color?: string;
}

export interface KanbanItem {
  id: string;
}

export interface KanbanViewProps<T extends KanbanItem, TStatus extends string = string> {
  /** All items to display. */
  items: T[];
  /** Column definitions in display order. */
  columns: KanbanColumn<TStatus>[];
  /** Function to extract the status/stage key from an item. */
  getItemStatus: (item: T) => TStatus;
  /** Render function for each card. */
  renderCard: (item: T) => React.ReactNode;
  /** Called when an item is dragged to a new column. */
  onStatusChange?: (itemId: string, newStatus: TStatus) => void;
  /** Class name for the outer container. */
  className?: string;
}

// ---- Draggable Card Wrapper ----

function DraggableCard<T extends KanbanItem>({
  item,
  renderCard,
}: {
  item: T;
  renderCard: (item: T) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: 'kanban-card', item },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-grab active:cursor-grabbing transition-all duration-200',
        isDragging && 'opacity-30 scale-95'
      )}
    >
      {renderCard(item)}
    </div>
  );
}

// ---- Droppable Column ----

function KanbanColumnComponent<T extends KanbanItem>({
  column,
  items,
  renderCard,
  isDragActive,
}: {
  column: KanbanColumn;
  items: T[];
  renderCard: (item: T) => React.ReactNode;
  isDragActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-col-${column.key}`,
    data: { type: 'kanban-column', status: column.key },
  });
  const itemIds = items.map(i => i.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-w-[280px] max-w-[320px] flex-shrink-0 rounded-xl bg-muted/30 border border-border/30 transition-all duration-200',
        isOver && 'ring-2 ring-primary/40 ring-inset bg-primary/5 border-primary/30',
        isDragActive && !isOver && 'border-dashed border-border/60'
      )}
    >
      <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {items.length}
        </Badge>
      </div>
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        <div className="p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-16rem)]">
          {items.length === 0 && (
            <div
              className={cn(
                'py-8 text-center text-xs text-muted-foreground rounded-lg transition-all duration-200',
                isOver && 'bg-primary/10 text-primary border border-dashed border-primary/30 py-12',
                isDragActive && !isOver && 'border border-dashed border-border/40 py-10'
              )}
            >
              {isOver ? 'Drop here' : 'No items'}
            </div>
          )}
          {items.map(item => (
            <DraggableCard key={item.id} item={item} renderCard={renderCard} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ---- Main Component ----

export function KanbanView<T extends KanbanItem, TStatus extends string = string>({
  items,
  columns,
  getItemStatus,
  renderCard,
  onStatusChange,
  className,
}: KanbanViewProps<T, TStatus>) {
  const [activeItem, setActiveItem] = useState<T | null>(null);

  // Build a lookup from item ID to its column status for resolving drops on cards
  const itemStatusMap = useMemo(() => {
    const map = new Map<string, TStatus>();
    for (const item of items) {
      map.set(item.id, getItemStatus(item));
    }
    return map;
  }, [items, getItemStatus]);

  // Group items by status
  const itemsByStatus = useMemo(() => {
    const map = new Map<TStatus, T[]>();
    for (const col of columns) map.set(col.key, []);
    for (const item of items) {
      const status = getItemStatus(item);
      const list = map.get(status);
      if (list) list.push(item);
    }
    return map;
  }, [items, columns, getItemStatus]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current as { item?: T } | undefined;
      setActiveItem(activeData?.item ?? null);
    },
    [setActiveItem]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveItem(null);

      const { active, over } = event;
      if (!over || !onStatusChange) return;

      const activeData = active.data.current as { item?: T } | undefined;
      const draggedItem = activeData?.item;
      if (!draggedItem) return;

      const currentStatus = getItemStatus(draggedItem);

      // Resolve target status: could be a column droppable or a card sortable
      const overData = over.data.current as
        | { type?: string; status?: TStatus; item?: T }
        | undefined;

      let targetStatus: TStatus | undefined;

      if (overData?.type === 'kanban-column') {
        // Dropped directly on a column
        targetStatus = overData.status;
      } else if (overData?.type === 'kanban-card') {
        // Dropped on a card — find which column that card belongs to
        targetStatus = itemStatusMap.get(String(over.id));
      } else {
        // Fallback: check if the over ID matches a column prefix
        const overId = String(over.id);
        if (overId.startsWith('kanban-col-')) {
          targetStatus = overId.replace('kanban-col-', '') as TStatus;
        }
      }

      if (!targetStatus || currentStatus === targetStatus) return;

      onStatusChange(String(active.id), targetStatus);
    },
    [onStatusChange, getItemStatus, itemStatusMap]
  );

  const handleDragCancel = useCallback(() => {
    setActiveItem(null);
  }, []);

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className={cn('flex gap-4 overflow-x-auto pb-4 -mx-2 px-2', className)}>
        {columns.map(col => (
          <KanbanColumnComponent
            key={col.key}
            column={col}
            items={itemsByStatus.get(col.key) ?? []}
            renderCard={renderCard}
            isDragActive={activeItem !== null}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeItem ? (
          <div className="shadow-2xl ring-2 ring-primary/30 rounded-2xl scale-105 opacity-95 rotate-1 pointer-events-none">
            {renderCard(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
