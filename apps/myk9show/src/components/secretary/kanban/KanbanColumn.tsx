import type React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { KanbanStatus } from './kanban-types';

interface KanbanColumnProps {
  id: KanbanStatus;
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
  onAddTask?: (() => void) | undefined;
}

export function KanbanColumn({ id, title, icon, count, children, onAddTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[200px] flex-col rounded-lg border bg-muted/30 p-3 transition-colors',
        isOver && 'border-primary/50 bg-primary/5'
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          <span>{title}</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        {children}
        {onAddTask && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-start gap-1.5 text-xs text-muted-foreground"
            onClick={onAddTask}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Task
          </Button>
        )}
      </div>
    </div>
  );
}
