import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  normalizeClassManagementSearchParams,
  type ClassManagementStatusFilter,
  type OperationalViewDensity,
} from '@/components/classes/classManagementFilters';
import type { ClassManagementOperationalView } from '@/features/operational-views/operationalViews';

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
  /** Apply a full restored/saved view in one URL update (Design Decision 1 adapter). */
  applyView: (view: ClassManagementOperationalView) => void;
  clearFilters: () => void;
}

/**
 * URL-backed filter state for `ClassManagementPage`, mirroring
 * `useEntryManagementFilters` (`@/hooks/useEntryManagementFilters`). `status`
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

  const applyView = useCallback(
    (view: ClassManagementOperationalView) => {
      const { filters, display } = view;
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (filters.status === 'all') next.delete('status');
          else next.set('status', filters.status);
          if (filters.search === '') next.delete('search');
          else next.set('search', filters.search);
          const density = display?.density ?? 'comfortable';
          if (density === 'comfortable') next.delete('density');
          else next.set('density', density);
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
    applyView,
    clearFilters,
  };
}
