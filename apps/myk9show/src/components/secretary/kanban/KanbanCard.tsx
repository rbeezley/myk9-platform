import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { KanbanTask } from './kanban-types';

interface KanbanCardProps {
  task: KanbanTask;
  onEdit?: () => void;
  onDelete?: () => void;
  isDragOverlay?: boolean;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-destructive/10 text-destructive border-destructive/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  low: 'bg-muted text-muted-foreground border-border',
};

function formatDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function KanbanCard({ task, onEdit, onDelete, isDragOverlay = false }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: isDragOverlay,
  });
  const [menuOpen, setMenuOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-lg border bg-card p-3 shadow-sm',
        isDragOverlay && 'rotate-2 shadow-lg',
        isDragging && 'opacity-50'
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
        {!isDragOverlay && (onEdit || onDelete) && (
          <div className="relative">
            <button
              className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              onClick={e => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              onPointerDown={e => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-28 rounded-md border bg-popover p-1 shadow-md">
                {onEdit && (
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted"
                    onClick={e => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onEdit();
                    }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={e => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete();
                    }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {task.description && (
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.priority && (
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', PRIORITY_STYLES[task.priority])}
          >
            {task.priority}
          </Badge>
        )}
        {task.dueDate && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Calendar className="h-2.5 w-2.5" />
            {formatDate(task.dueDate)}
          </span>
        )}
        {task.assignee && (
          <span className="text-[10px] text-muted-foreground">@{task.assignee}</span>
        )}
      </div>
    </div>
  );
}
