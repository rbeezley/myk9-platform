import { useCallback, useState } from 'react';
import { loadCollapsedTrialIds, saveCollapsedTrialIds } from './atShowClassListState';

/**
 * Trial sections default to open; we track the COLLAPSED ones so an empty record
 * means "all expanded" (the page's original behavior). Persisted per show so a
 * judge's focus on one ring survives reloads.
 */
export function useCollapsedTrials(showId: string | undefined) {
  const [collapsedTrialIds, setCollapsedTrialIds] = useState<Set<string>>(
    () => new Set(showId ? loadCollapsedTrialIds(showId) : [])
  );

  // The `/at-show/:showId` route reuses the page instance across a param change
  // (no remount), so re-load the per-show collapsed set whenever the show
  // changes; otherwise the new show would inherit the previous show's collapsed
  // sections and the next toggle would persist them under its key. React's
  // "adjust state during render" pattern (no effect).
  const [trackedShowId, setTrackedShowId] = useState(showId);
  if (showId !== trackedShowId) {
    setTrackedShowId(showId);
    setCollapsedTrialIds(new Set(showId ? loadCollapsedTrialIds(showId) : []));
  }

  const toggleTrial = useCallback(
    (trialId: string, open: boolean) => {
      setCollapsedTrialIds(current => {
        const next = new Set(current);
        // `open` is the next desired state from the Collapsible: open => not collapsed.
        if (open) next.delete(trialId);
        else next.add(trialId);
        if (showId) saveCollapsedTrialIds(showId, [...next]);
        return next;
      });
    },
    [showId]
  );

  return { collapsedTrialIds, toggleTrial };
}
