import { useState, useCallback, useMemo } from 'react';

export type ViewMode = 'cards' | 'table';

const CARD_TABLE_KEYS: readonly string[] = ['cards', 'table'];

export const CARD_TABLE_MODES = [
  { key: 'cards', label: 'Cards', icon: 'grid' as const },
  { key: 'table', label: 'Table', icon: 'table' as const },
] as const;

function readStored<M extends string>(key: string, validModes: readonly string[]): M | null {
  try {
    const stored = localStorage.getItem(`view-pref-${key}`);
    if (stored && validModes.includes(stored)) return stored as M;
  } catch {
    // localStorage unavailable (SSR, privacy mode)
  }
  return null;
}

/**
 * A list's remembered view. `validModes` defaults to cards and table; a list that offers more
 * (Find Shows adds calendar and map) passes its own keys. The remembered choice is per `tabKey`,
 * so a list with two tabs can pass a different key for each and the choice follows the tab.
 */
export function useViewPreference<M extends string = ViewMode>(
  tabKey: string,
  defaultMode: NoInfer<M>,
  validModes: readonly string[] = CARD_TABLE_KEYS
): [M, (mode: string) => void, boolean] {
  // A choice made in this session, by key, so it shows at once and survives a key switch.
  const [chosen, setChosen] = useState<Record<string, M>>({});
  const modesKey = validModes.join('|');
  // Read once per key; a write below updates `chosen`, which wins over this.
  const stored = useMemo(
    () => readStored<M>(tabKey, validModes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validModes is identified by modesKey
    [tabKey, modesKey]
  );

  const setMode = useCallback(
    (newMode: string) => {
      if (!validModes.includes(newMode)) return;
      try {
        localStorage.setItem(`view-pref-${tabKey}`, newMode);
      } catch {
        // localStorage full or unavailable
      }
      setChosen(prev => (prev[tabKey] === newMode ? prev : { ...prev, [tabKey]: newMode as M }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- validModes is identified by modesKey
    [tabKey, modesKey]
  );

  const remembered = chosen[tabKey] ?? stored;
  return [remembered ?? defaultMode, setMode, remembered !== null];
}
