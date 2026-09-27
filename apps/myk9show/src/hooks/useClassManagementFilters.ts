import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  normalizeClassManagementSearchParams,
  type ClassManagementFilterState,
  type ClassManagementStatusFilter,
  type OperationalViewDensity,
} from '@/components/classes/classManagementFilters';

interface UseClassManagementFiltersReturn {
  search: string;
  setSearch: (value: string) => void;
  status: ClassManagementStatusFilter;
  setStatus: (value: ClassManagementStatusFilter) => void;
  element: string;
  setElement: (value: string) => void;
  density: OperationalViewDensity;
  focusClassId: string | null;
  setDensity: (value: OperationalViewDensity) => void;
  /**
   * Applies a full list-toolkit view (status + element + search) in ONE URL
   * update — three separate setters called in the same handler would each
   * close over the same stale `searchParams`, so only the last would stick.
   */
  applyViewState: (state: ClassManagementFilterState) => void;
  clearFilters: () => void;
}

/**
 * URL-backed filter state for `ClassManagementPage`, mirroring
 * Entry Management's URL-normalization model. `status`
 * is the lifecycle bucket, not the raw class status.
 */
export function useClassManagementFilters(): UseClassManagementFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const normalized = useMemo(
    () => normalizeClassManagementSearchParams(searchParams),
    [searchParams]
  );

  useEffect(() => {
    if (normalized.params.toString() !== searchParams.toString()) {
      setSearchParams(normalized.params, { replace: true });
    }
  }, [normalized, searchParams, setSearchParams]);

  const setSearch = useCallback(
    (value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === '') next.delete('search');
          else next.set('search', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setStatus = useCallback(
    (value: ClassManagementStatusFilter) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === 'all') next.delete('status');
          else next.set('status', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setElement = useCallback(
    (value: string) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === 'all' || value === '') next.delete('element');
          else next.set('element', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setDensity = useCallback(
    (value: OperationalViewDensity) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (value === 'comfortable') next.delete('density');
          else next.set('density', value);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const applyViewState = useCallback(
    (state: ClassManagementFilterState) => {
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (state.status === 'all') next.delete('status');
          else next.set('status', state.status);
          if (state.element === 'all' || state.element === '') next.delete('element');
          else next.set('element', state.element);
          if (state.search === '') next.delete('search');
          else next.set('search', state.search);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete('search');
        next.delete('status');
        next.delete('element');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  return {
    search: normalized.search,
    setSearch,
    status: normalized.status,
    setStatus,
    element: normalized.element,
    setElement,
    density: normalized.density,
    focusClassId: normalized.focusClassId,
    setDensity,
    applyViewState,
    clearFilters,
  };
}
