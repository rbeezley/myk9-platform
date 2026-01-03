/**
 * Kanban Column Component
 *
 * A droppable column for the Kanban board.
 */

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import type { KanbanStatus } from '../types';

interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  onAddTask?: () => void;
}

export function KanbanColumn({
  id,
  title,
  icon,
  count,
  children,
  onAddTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
  });

  return (
    <div
      className={`kanban-column ${isOver ? 'drop-target' : ''}`}
      ref={setNodeRef}
    >
      <div className="kanban-column-header">
        <div className="kanban-column-title">
          {icon}
          <span>{title}</span>
        </div>
        <span className="kanban-column-count">{count}</span>
      </div>

      <div className="kanban-column-content">
        {children}

        {onAddTask && (
          <button className="kanban-add-button" onClick={onAddTask}>
            <Plus size={16} />
            <span>Add Task</span>
          </button>
        )}
      </div>
    </div>
  );
}
