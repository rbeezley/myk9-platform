import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SHOW_WORKBENCH_PHASES = ['setup', 'show-desk'] as const;

export type ShowWorkbenchPhase = (typeof SHOW_WORKBENCH_PHASES)[number];

// INTENT: Phase-aware helpers (About copy, AskQ prompts, checklists) only
// apply to the Setup tab now that Phase B5 removed Today and Wrap-up. The
// alias stays in case a future contributor needs the narrowed type — but
// today it's effectively `'setup'`.
export type LegacyShowWorkbenchPhase = Extract<ShowWorkbenchPhase, 'setup'>;

const PHASE_SET = new Set<string>(SHOW_WORKBENCH_PHASES);

// INTENT: Phase B5 deleted Today and Wrap-up tabs. Any stale URL or in-app
// link pointing at the old values resolves to Show Desk (the canonical
// operational surface). useActivePhase auto-cleans the URL on first render
// so the param doesn't linger after the redirect.
const LEGACY_PHASE_VALUES = new Set(['today', 'wrap-up']);

export function isShowWorkbenchPhase(value: string | null): value is ShowWorkbenchPhase {
  return value !== null && PHASE_SET.has(value);
}

// INTENT: Show Desk is the canonical landing once a show exists; Setup is for
// pre-show structural work. Plan B2a flipped the default; B5 made it
// canonical by removing the alternative operational tabs.
export function useActivePhase(
  defaultPhase: ShowWorkbenchPhase = 'show-desk'
): [ShowWorkbenchPhase, (phase: ShowWorkbenchPhase) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPhase = searchParams.get('phase');
  const isLegacyPhase = rawPhase !== null && LEGACY_PHASE_VALUES.has(rawPhase);
  const activePhase = isShowWorkbenchPhase(rawPhase) ? rawPhase : defaultPhase;

  // Auto-clean legacy phase params on mount. Pre-launch (no real bookmarks
  // to break) — purely hygiene so the URL stops carrying the dead param.
  useEffect(() => {
    if (!isLegacyPhase) return;
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('phase');
        return next;
      },
      { replace: true }
    );
  }, [isLegacyPhase, setSearchParams]);

  const setPhase = useCallback(
    (phase: ShowWorkbenchPhase) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (phase === defaultPhase) {
            next.delete('phase');
          } else {
            next.set('phase', phase);
          }
          return next;
        },
        { replace: true }
      );
    },
    [defaultPhase, setSearchParams]
  );

  return [activePhase, setPhase];
}
