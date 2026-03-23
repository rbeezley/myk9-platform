import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-synced tab state hook.
 *
 * Reads the active tab from the `?tab=` search param and validates it against
 * the provided list of allowed tabs. Falls back to `defaultTab` when the param
 * is missing or invalid.
 *
 * Note: `allowedTabs` should reflect only the currently visible tabs. Pages that
 * conditionally hide tabs must pass a dynamic `allowedTabs` array so this hook
 * falls back to the default when a hidden tab is in the URL.
 */
export function useUrlTab(
  allowedTabs: readonly string[],
  defaultTab: string
): [string, (tab: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = rawTab && allowedTabs.includes(rawTab) ? rawTab : defaultTab;

  const setTab = useCallback(
    (tab: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (tab === defaultTab) {
            next.delete('tab');
          } else {
            next.set('tab', tab);
          }
          return next;
        },
        { replace: true }
      );
    },
    [defaultTab, setSearchParams]
  );

  return [activeTab, setTab];
}
