import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  applyDogDetailsState,
  parseDogDetailsState,
  type DogDetailsSection,
  type DogDetailsSectionState,
  type DogDetailsView,
} from './dogDetailsSections';

/**
 * URL-synced Overview/Career/Records + secondary-view state for Dog Details.
 * Wraps the pure dogDetailsSections model around react-router search params
 * so legacy `tab=` links, Back/Forward, refresh, and copied deep links all
 * resolve to a valid section/view.
 */
export function useDogDetailsNavigation(): {
  state: DogDetailsSectionState;
  setSection: (section: DogDetailsSection) => void;
  setView: (view: DogDetailsView) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => parseDogDetailsState(searchParams), [searchParams]);

  const setSection = useCallback(
    (section: DogDetailsSection) => {
      setSearchParams(prev => applyDogDetailsState(prev, { section, view: null }), {
        replace: false,
      });
    },
    [setSearchParams]
  );

  const setView = useCallback(
    (view: DogDetailsView) => {
      setSearchParams(prev => applyDogDetailsState(prev, { section: state.section, view }), {
        replace: false,
      });
    },
    [setSearchParams, state.section]
  );

  return { state, setSection, setView };
}
