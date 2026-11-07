import { useCallback, useMemo, useState } from 'react';
import { defaultOpenYourRingGroupKeys, type YourRingTrialGroup } from './groupYourRingByTrial';

/**
 * Open state for Your ring's trial groups (MYK9-1739). The default (today's
 * trials, else the next upcoming) is derived from the data on every render, so
 * it stays right as classes arrive; only the judge's own toggles are stored,
 * and they win over the default. Not persisted: unlike the show-wide list, the
 * right default here changes with the date.
 */
export function useYourRingGroupOpen(groups: readonly YourRingTrialGroup[]) {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const defaults = useMemo(() => defaultOpenYourRingGroupKeys(groups), [groups]);
  const isGroupOpen = useCallback(
    (key: string) => overrides.get(key) ?? defaults.has(key),
    [overrides, defaults]
  );
  const toggleGroup = useCallback((key: string, open: boolean) => {
    setOverrides(current => new Map(current).set(key, open));
  }, []);
  return { isGroupOpen, toggleGroup };
}
