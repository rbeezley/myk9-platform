import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { normalizeCockpitUrlState, type CockpitUrlState } from './cockpitRoutes';

export function useSecretaryCockpitUrlState(): {
  state: CockpitUrlState;
  updateState: (updates: Partial<CockpitUrlState>, options?: { replace?: boolean }) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => normalizeCockpitUrlState(searchParams), [searchParams]);

  const updateState = useCallback(
    (updates: Partial<CockpitUrlState>, options?: { replace?: boolean }) => {
      setSearchParams(
        previous => {
          const nextState = { ...normalizeCockpitUrlState(previous), ...updates };
          const next = new URLSearchParams();
          if (nextState.selectedDay) next.set('day', nextState.selectedDay);
          if (nextState.filter !== 'all') next.set('filter', nextState.filter);
          if (nextState.focusedClassId) next.set('focus', nextState.focusedClassId);
          if (nextState.anchor) next.set('anchor', nextState.anchor);
          return next;
        },
        { replace: options?.replace ?? true }
      );
    },
    [setSearchParams]
  );

  return { state, updateState };
}
