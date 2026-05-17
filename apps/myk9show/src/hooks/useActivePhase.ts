import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const SHOW_WORKBENCH_PHASES = ['setup', 'today', 'wrap-up'] as const;

export type ShowWorkbenchPhase = (typeof SHOW_WORKBENCH_PHASES)[number];

const PHASE_SET = new Set<string>(SHOW_WORKBENCH_PHASES);

export function isShowWorkbenchPhase(value: string | null): value is ShowWorkbenchPhase {
  return value !== null && PHASE_SET.has(value);
}

export function useActivePhase(
  defaultPhase: ShowWorkbenchPhase = 'setup'
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
