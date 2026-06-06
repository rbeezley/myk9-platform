import { useState, useCallback } from 'react';

export type ViewMode = 'cards' | 'table';

const VALID_MODES: ReadonlySet<string> = new Set(['cards', 'table']);

export const CARD_TABLE_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

interface ViewPreferenceState {
  mode: ViewMode;
  hasStoredPreference: boolean;
}

function readPreference(key: string, defaultMode: ViewMode): ViewPreferenceState {
  try {
    const stored = localStorage.getItem(`view-pref-${key}`);
    if (stored && VALID_MODES.has(stored)) {
      return { mode: stored as ViewMode, hasStoredPreference: true };
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode)
  }
  return { mode: defaultMode, hasStoredPreference: false };
}

export function useViewPreference(
  tabKey: string,
  defaultMode: ViewMode
): [ViewMode, (mode: string) => void, boolean] {
  const [preference, setPreference] = useState<ViewPreferenceState>(() =>
    readPreference(tabKey, defaultMode)
  );

  const setMode = useCallback(
    (newMode: string) => {
      if (!VALID_MODES.has(newMode)) return;
      const validated = newMode as ViewMode;
      setPreference(prev => {
        if (prev.mode === validated && prev.hasStoredPreference) return prev;
        try {
          localStorage.setItem(`view-pref-${tabKey}`, validated);
        } catch {
          // localStorage full or unavailable
        }
        return { mode: validated, hasStoredPreference: true };
      });
    },
    [tabKey]
  );

  return [preference.mode, setMode, preference.hasStoredPreference];
}
