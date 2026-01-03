/**
 * Kanban Card Component
 *
 * A draggable task card for the Kanban board.
 */

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { KanbanTask } from '../types';

interface KanbanCardProps {
  task: KanbanTask;
  onEdit?: () => void;
  onDelete?: () => void;
  isDragOverlay?: boolean;
  /** Hide edit/delete menu in read-only mode */
  isReadOnly?: boolean;
}

export function KanbanCard({
  task,
  onEdit,
  onDelete,
  isDragOverlay = false,
  isReadOnly = false,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: isDragOverlay || isReadOnly,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [showMenu, setShowMenu] = React.useState(false);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleMenuClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kanban-card ${isDragging ? 'dragging' : ''} ${isDragOverlay ? 'drag-overlay' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="kanban-card-header">
        <h4 className="kanban-card-title">{task.title}</h4>
        {!isDragOverlay && !isReadOnly && (
          <div className="kanban-card-actions">
            <button
              className="kanban-card-menu-btn"
              onClick={handleMenuClick}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={14} />
            </button>
            {showMenu && (
              <div className="kanban-card-menu">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onEdit?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Pencil size={12} />
                  <span>Edit</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                    onDelete?.();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="delete"
                >
                  <Trash2 size={12} />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {task.description && (
        <p className="kanban-card-description">{task.description}</p>
      )}

      <div className="kanban-card-meta">
        {task.priority && (
          <span className={`kanban-card-priority ${task.priority}`}>
            {task.priority}
          </span>
        )}
        {task.dueDate && (
          <span className="kanban-card-due">
            <Calendar size={12} />
            {formatDate(task.dueDate)}
          </span>
        )}
        {task.assignee && (
          <span className="kanban-card-assignee">@{task.assignee}</span>
        )}
      </div>
    </div>
  );
}
