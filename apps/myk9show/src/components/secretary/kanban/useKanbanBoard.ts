/**
 * Kanban Board Hook — localStorage persistence scoped by showId.
 */

import { useState, useEffect, useCallback } from 'react';
import type { KanbanTask, KanbanState, KanbanStatus } from './kanban-types';

const STORAGE_KEY_PREFIX = 'myk9show-kanban-';

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useKanbanBoard(showId: string | undefined) {
  const storageKey = `${STORAGE_KEY_PREFIX}${showId || 'default'}`;
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage
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
    setIsLoaded(true);
  }, [storageKey]);

  // Save to localStorage after initial load
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const state: KanbanState = { tasks, lastModified: new Date().toISOString() };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [tasks, storageKey, isLoaded]);

  const addTask = useCallback((taskData: Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    setTasks(prev => [
      ...prev,
      {
        ...taskData,
        id: generateId(),
        status: taskData.status || 'todo',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<KanbanTask>) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
      )
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const moveTask = useCallback((taskId: string, newStatus: KanbanStatus) => {
    setTasks(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t
      )
    );
  }, []);

  return { tasks, addTask, updateTask, deleteTask, moveTask };
}
