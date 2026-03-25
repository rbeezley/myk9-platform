/**
 * Kanban Board — drag-and-drop task management for secretaries.
 * Three columns: To Do, In Progress, Done. Persists to localStorage per show.
 */

import { useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Circle, PlayCircle, CheckCircle2 } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { TaskDialog } from './TaskDialog';
import { useKanbanBoard } from './useKanbanBoard';
import type { KanbanTask, KanbanStatus } from './kanban-types';

const COLUMNS: { id: KanbanStatus; title: string; icon: React.ReactNode }[] = [
  { id: 'todo', title: 'To Do', icon: <Circle className="h-4 w-4" /> },
  { id: 'in-progress', title: 'In Progress', icon: <PlayCircle className="h-4 w-4" /> },
  { id: 'done', title: 'Done', icon: <CheckCircle2 className="h-4 w-4" /> },
];

interface KanbanBoardProps {
  showId: string | undefined;
}

export function KanbanBoard({ showId }: KanbanBoardProps) {
  const { tasks, addTask, updateTask, deleteTask, moveTask } = useKanbanBoard(showId);
  const [activeTask, setActiveTask] = useState<KanbanTask | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<KanbanTask | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find(t => t.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Dropped on a column
    const targetColumn = COLUMNS.find(col => col.id === overId);
    if (targetColumn) {
      moveTask(activeId, targetColumn.id);
      return;
    }

    // Dropped on another task — move to that task's column
    const overTask = tasks.find(t => t.id === overId);
    if (overTask) {
      moveTask(activeId, overTask.status);
    }
  };

  const handleSaveTask = (taskData: Partial<KanbanTask>) => {
    if (editingTask) {
      updateTask(editingTask.id, taskData);
    } else {
      addTask(taskData as Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt'>);
    }
    setEditingTask(null);
  };

  const tasksByStatus = useMemo(() => {
    const grouped: Record<KanbanStatus, KanbanTask[]> = { todo: [], 'in-progress': [], done: [] };
    for (const t of tasks) grouped[t.status].push(t);
    return grouped;
  }, [tasks]);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {COLUMNS.map(col => {
            const columnTasks = tasksByStatus[col.id];
            return (
              <KanbanColumn
                key={col.id}
                id={col.id}
                title={col.title}
                icon={col.icon}
                count={columnTasks.length}
                onAddTask={
                  col.id === 'todo'
                    ? () => {
                        setEditingTask(null);
                        setDialogOpen(true);
                      }
                    : undefined
                }
              >
                <SortableContext
                  items={columnTasks.map(t => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {columnTasks.map(task => (
                    <KanbanCard
                      key={task.id}
                      task={task}
                      onEdit={() => {
                        setEditingTask(task);
                        setDialogOpen(true);
                      }}
                      onDelete={() => deleteTask(task.id)}
                    />
                  ))}
                </SortableContext>
              </KanbanColumn>
            );
          })}

          <DragOverlay>
            {activeTask ? <KanbanCard task={activeTask} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={open => {
          setDialogOpen(open);
          if (!open) setEditingTask(null);
        }}
        onSave={handleSaveTask}
        task={editingTask}
      />
    </>
  );
}
