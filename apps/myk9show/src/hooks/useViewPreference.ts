import { useState, useCallback } from 'react';

type ViewMode = 'cards' | 'table';

const VALID_MODES: ReadonlySet<string> = new Set(['cards', 'table']);

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
      setModeState(newMode);
      try {
        localStorage.setItem(`view-pref-${tabKey}`, newMode);
      } catch {
        // localStorage full or unavailable
      }
    },
    [tabKey],
  );

  return [mode, setMode];
}
