/**
 * Kanban Board Hook — localStorage persistence scoped by showId.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateId } from '@/utils/idUtils';
import type { KanbanTask, KanbanState, KanbanStatus } from './kanban-types';

const STORAGE_KEY_PREFIX = 'myk9show-kanban-';

export function useKanbanBoard(showId: string | undefined) {
  const storageKey = `${STORAGE_KEY_PREFIX}${showId || 'default'}`;
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const isDirty = useRef(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state: KanbanState = JSON.parse(stored);
        setTasks(state.tasks || []);
      } else {
        setTasks([]);
      }
    } catch {
      // Ignore parse errors
    }
    isDirty.current = false;
    setIsLoaded(true);
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!isLoaded || !isDirty.current) return;
    try {
      const state: KanbanState = { tasks, lastModified: new Date().toISOString() };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [tasks, storageKey, isLoaded]);

  const addTask = useCallback((taskData: Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    isDirty.current = true;
    setTasks(prev => [
      ...prev,
      {
        ...taskData,
        id: `task-${generateId()}`,
        status: taskData.status || 'todo',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<KanbanTask>) => {
    isDirty.current = true;
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      )
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    isDirty.current = true;
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const moveTask = useCallback((taskId: string, newStatus: KanbanStatus) => {
    isDirty.current = true;
    setTasks(prev =>
      prev.map(t => {
        if (t.id !== taskId || t.status === newStatus) return t;
        return { ...t, status: newStatus, updatedAt: new Date().toISOString() };
      })
    );
  }, []);

  return { tasks, addTask, updateTask, deleteTask, moveTask };
}
