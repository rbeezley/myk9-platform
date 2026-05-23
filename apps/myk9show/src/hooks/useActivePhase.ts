import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SHOW_WORKBENCH_PHASES = ['setup', 'today', 'wrap-up', 'show-desk'] as const;

export type ShowWorkbenchPhase = (typeof SHOW_WORKBENCH_PHASES)[number];

// INTENT: The legacy Today / Wrap-up surfaces and their phase-aware helpers
// (About copy, AskQ prompts, checklists) predate Show Desk and are scheduled
// for removal in Phase B5. Until then, keep the legacy-only union so those
// helpers can't accidentally be invoked with 'show-desk' (whose adaptive
// header replaces those concepts).
export type LegacyShowWorkbenchPhase = Exclude<ShowWorkbenchPhase, 'show-desk'>;

const PHASE_SET = new Set<string>(SHOW_WORKBENCH_PHASES);

export function isShowWorkbenchPhase(value: string | null): value is ShowWorkbenchPhase {
  return value !== null && PHASE_SET.has(value);
}

// INTENT: Show Desk is the canonical landing once a show exists; Setup is for
// pre-show structural work. Plan B2a flips the default — see
// docs/plan-show-map-workbench-collapse.md "Default tab on /secretary/shows/:id".
export function useActivePhase(
  defaultPhase: ShowWorkbenchPhase = 'show-desk'
): [ShowWorkbenchPhase, (phase: ShowWorkbenchPhase) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPhase = searchParams.get('phase');
  const activePhase = isShowWorkbenchPhase(rawPhase) ? rawPhase : defaultPhase;

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
