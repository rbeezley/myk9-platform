import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildShowMapTree } from './showMapTree';
import { useShowMapActionExecutor } from './useShowMapActionExecutor';
import { useShowMapRunOrderAutoSort } from './useShowMapRunOrderAutoSort';
import type { BuildShowMapTreeInput, ShowMapTree } from './showMapTypes';

export interface UseShowMapWorkbenchStateInput extends BuildShowMapTreeInput {
  showId: string;
  scopeNow?: Date | undefined;
}

// INTENT: Single source of truth for the workbench orchestration state the
// Show Desk panel reads: the tree, the action executor, navigation, the
// ticking "now" and run-order auto-sort.
export function useShowMapWorkbenchState({
  show,
  trials,
  classes,
  entries,
  showId,
  scopeNow,
  entryPreviewLimit,
}: UseShowMapWorkbenchStateInput) {
  const navigate = useNavigate();

  // `entryPreviewLimit` was accepted by the input type and then dropped here, so a
  // caller asking for a fuller tree silently got the 25-entry default (F29b phase 1).
  const tree = useMemo<ShowMapTree>(
    () =>
      buildShowMapTree({
        show,
        trials,
        classes,
        entries,
        ...(entryPreviewLimit !== undefined && { entryPreviewLimit }),
      }),
    [show, trials, classes, entries, entryPreviewLimit]
  );

  /**
   * "Now", ticking once a minute.
   *
   * This used to be `useMemo(() => scopeNow ?? new Date(), [scopeNow])`. With
   * no `scopeNow` passed -- which is the Show Desk's case -- the dependency is
   * permanently `undefined`, so the memo evaluated ONCE per mount and the desk's
   * clock stopped at page load. A desk left open from 8am to 4pm, which is the
   * normal show-day pattern, kept its "Now" marker at 8am: the up-next ordering,
   * the selected day, the running-late derivations and every time-triggered
   * attention action were all reasoning about breakfast.
   *
   * A minute is the right granularity -- everything downstream is displayed to
   * the minute -- and the interval only runs when no explicit `scopeNow` was
   * supplied, so tests and callers that pin the clock stay deterministic.
   */
  const [tickNow, setTickNow] = useState(() => new Date());
  useEffect(() => {
    if (scopeNow) return undefined;
    const id = setInterval(() => setTickNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [scopeNow]);
  const effectiveScopeNow = scopeNow ?? tickNow;

  const navigateTo = useCallback((href: string) => navigate(href), [navigate]);

  const executor = useShowMapActionExecutor({ showId });
  const runOrderAutoSort = useShowMapRunOrderAutoSort({ showId });

  return {
    tree,
    effectiveScopeNow,
    executor,
    runOrderAutoSort,
    navigateTo,
  };
}
