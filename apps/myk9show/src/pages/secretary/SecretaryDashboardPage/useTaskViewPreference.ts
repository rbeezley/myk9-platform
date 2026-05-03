import { useState, useCallback } from 'react';

export type TaskViewMode = 'list' | 'timeline';

const VALID_TASK_MODES: ReadonlySet<string> = new Set(['list', 'timeline']);
const STORAGE_KEY = 'view-pref-secretary-tasks';

export const TASK_VIEW_MODES = [
  { key: 'list', label: 'List', icon: 'list' as const },
  { key: 'timeline', label: 'Timeline', icon: 'calendar' as const },
] as const;

function readTaskPreference(): TaskViewMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_TASK_MODES.has(stored)) return stored as TaskViewMode;
  } catch {
    // localStorage unavailable (SSR, privacy mode)
  }
  return 'list';
}

export function useTaskViewPreference(): [TaskViewMode, (mode: string) => void] {
  const [mode, setModeState] = useState<TaskViewMode>(readTaskPreference);

  const setMode = useCallback((newMode: string) => {
    if (!VALID_TASK_MODES.has(newMode)) return;
    const validated = newMode as TaskViewMode;
    setModeState(prev => {
      if (prev === validated) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, validated);
      } catch {
        // localStorage full or unavailable
      }
      return validated;
    });
  }, []);

  return [mode, setMode];
}
