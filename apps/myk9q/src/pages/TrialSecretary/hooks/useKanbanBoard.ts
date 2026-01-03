/**
 * Kanban Board Hook
 *
 * Manages Kanban board state with localStorage persistence.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import type { KanbanTask, KanbanState, KanbanStatus } from '../types';

const STORAGE_KEY_PREFIX = 'myK9Q-kanban-';

function generateId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function useKanbanBoard() {
  const { showContext } = useAuth();
  const storageKey = `${STORAGE_KEY_PREFIX}${showContext?.licenseKey || 'default'}`;

  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount - intentional setState in effect for initial hydration
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const state: KanbanState = JSON.parse(stored);
        setTasks(state.tasks || []);
      }
    } catch (error) {
      console.error('[useKanbanBoard] Failed to load from localStorage:', error);
    }
    // Mark as loaded after attempting to load (even if nothing was stored)
    setIsLoaded(true);
  }, [storageKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Save to localStorage whenever tasks change (but only after initial load)
  useEffect(() => {
    // Skip saving until we've loaded existing data
    if (!isLoaded) return;

    try {
      const state: KanbanState = {
        tasks,
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (error) {
      console.error('[useKanbanBoard] Failed to save to localStorage:', error);
    }
  }, [tasks, storageKey, isLoaded]);

  const addTask = useCallback((taskData: Omit<KanbanTask, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date().toISOString();
    const newTask: KanbanTask = {
      ...taskData,
      id: generateId(),
      status: taskData.status || 'todo',
      createdAt: now,
      updatedAt: now,
    };
    setTasks(prev => [...prev, newTask]);
  }, []);

  const updateTask = useCallback((taskId: string, updates: Partial<KanbanTask>) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? { ...task, ...updates, updatedAt: new Date().toISOString() }
          : task
      )
    );
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  const moveTask = useCallback((taskId: string, newStatus: KanbanStatus) => {
    setTasks(prev =>
      prev.map(task =>
        task.id === taskId
          ? { ...task, status: newStatus, updatedAt: new Date().toISOString() }
          : task
      )
    );
  }, []);

  const clearAllTasks = useCallback(() => {
    setTasks([]);
  }, []);

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    clearAllTasks,
  };
}
