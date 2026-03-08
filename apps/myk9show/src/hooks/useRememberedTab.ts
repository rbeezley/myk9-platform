import { useState, useCallback } from 'react';

const STORAGE_KEY_PREFIX = 'myk9:tab:';

/**
 * Tab state hook with localStorage persistence.
 * Priority: URL param > localStorage > defaultTab.
 */
export function useRememberedTab(pageKey: string, defaultTab: string) {
  const storageKey = `${STORAGE_KEY_PREFIX}${pageKey}`;

  const [activeTab, setActiveTabState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return saved;
    } catch {
      // localStorage unavailable
    }
    return defaultTab;
  });

  const setActiveTab = useCallback(
    (tab: string) => {
      setActiveTabState(tab);
      try {
        localStorage.setItem(storageKey, tab);
      } catch {
        // localStorage full or unavailable
      }
    },
    [storageKey]
  );

  return [activeTab, setActiveTab] as const;
}
