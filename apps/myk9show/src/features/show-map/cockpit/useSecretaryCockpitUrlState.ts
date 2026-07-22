import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import {
  normalizeCockpitUrlState,
  writeCockpitUrlState,
  type CockpitUrlState,
} from './cockpitRoutes';

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
          return writeCockpitUrlState(previous, nextState);
        },
        { replace: options?.replace ?? true }
      );
    },
    [setSearchParams]
  );

  return { state, updateState };
}
