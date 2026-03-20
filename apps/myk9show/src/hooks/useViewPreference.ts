import { useState, useCallback } from 'react';

export type ViewMode = 'cards' | 'table';

const VALID_MODES: ReadonlySet<string> = new Set(['cards', 'table']);

export const CARD_TABLE_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

function readPreference(key: string, defaultMode: ViewMode): ViewMode {
  try {
    const stored = localStorage.getItem(`view-pref-${key}`);
    if (stored && VALID_MODES.has(stored)) return stored as ViewMode;
  } catch {
    // localStorage unavailable (SSR, privacy mode)
  }
  return defaultMode;
}

export function useViewPreference(
  tabKey: string,
  defaultMode: ViewMode,
): [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(() => readPreference(tabKey, defaultMode));

  const setMode = useCallback(
    (newMode: ViewMode) => {
      setModeState((prev) => {
        if (prev === newMode) return prev;
        try {
          localStorage.setItem(`view-pref-${tabKey}`, newMode);
        } catch {
          // localStorage full or unavailable
        }
        return newMode;
      });
    },
    [tabKey],
  );

  return [mode, setMode];
}
