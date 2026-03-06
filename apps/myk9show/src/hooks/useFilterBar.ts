import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isFilterActive } from '@/components/common/FilterBar/types';
import type {
  FilterBarState,
  FilterDefinition,
  FilterValue,
  SortDirection,
} from '@/components/common/FilterBar/types';

const URL_SYNC_DEBOUNCE_MS = 300;

/** Serialize filter state to URL search params */
function stateToParams(state: FilterBarState, filterDefs: FilterDefinition[]): URLSearchParams {
  const params = new URLSearchParams();

  for (const def of filterDefs) {
    const value = state.filters[def.key];
    if (value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (Array.isArray(value)) {
      params.set(`f_${def.key}`, value.join(','));
    } else if (typeof value === 'boolean') {
      params.set(`f_${def.key}`, 'true');
    } else {
      params.set(`f_${def.key}`, String(value));
    }
  }

  if (state.sortKey) {
    params.set('sort', state.sortKey);
    if (state.sortDirection === 'desc') {
      params.set('dir', 'desc');
    }
  }

  return params;
}

/** Parse URL search params into filter state */
function paramsToState(params: URLSearchParams, filterDefs: FilterDefinition[]): FilterBarState {
  const filters: Record<string, FilterValue> = {};

  for (const def of filterDefs) {
    const raw = params.get(`f_${def.key}`);
    if (raw === null) continue;

    switch (def.type) {
      case 'multi-select':
        filters[def.key] = raw.split(',').filter(Boolean);
        break;
      case 'boolean':
        filters[def.key] = raw === 'true';
        break;
      default:
        filters[def.key] = raw;
    }
  }

  const sortKey = params.get('sort') || null;
  const sortDirection: SortDirection = params.get('dir') === 'desc' ? 'desc' : 'asc';

  return { filters, sortKey, sortDirection };
}

interface UseFilterBarOptions {
  filterDefs: FilterDefinition[];
  /** Whether to sync state with URL search params (default: true) */
  syncUrl?: boolean;
}

export function useFilterBar({ filterDefs, syncUrl = true }: UseFilterBarOptions) {
  const [searchParams, setSearchParams] = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchParamsRef = useRef(searchParams);

  // Keep ref in sync without triggering the URL-write effect
  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  // Initialize state from URL params
  const [state, setState] = useState<FilterBarState>(() => {
    if (syncUrl) {
      return paramsToState(searchParams, filterDefs);
    }
    return { filters: {}, sortKey: null, sortDirection: 'asc' };
  });

  // Debounced URL sync — reads searchParams via ref to avoid dependency cycle
  useEffect(() => {
    if (!syncUrl) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const newParams = stateToParams(state, filterDefs);

      // Preserve non-filter params (like 'view')
      const preserved = new URLSearchParams();
      for (const [key, value] of searchParamsRef.current.entries()) {
        if (!key.startsWith('f_') && key !== 'sort' && key !== 'dir') {
          preserved.set(key, value);
        }
      }
      // Merge filter params
      for (const [key, value] of newParams.entries()) {
        preserved.set(key, value);
      }

      setSearchParams(preserved, { replace: true });
    }, URL_SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state, filterDefs, syncUrl, setSearchParams]);

  const setFilter = useCallback((key: string, value: FilterValue) => {
    setState(prev => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
    }));
  }, []);

  const removeFilter = useCallback((key: string) => {
    setState(prev => {
      const next = { ...prev.filters };
      delete next[key];
      return { ...prev, filters: next };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState(prev => ({ ...prev, filters: {} }));
  }, []);

  const setSort = useCallback((key: string | null, direction?: SortDirection) => {
    setState(prev => ({
      ...prev,
      sortKey: key,
      sortDirection:
        direction || (prev.sortKey === key && prev.sortDirection === 'asc' ? 'desc' : 'asc'),
    }));
  }, []);

  const activeFilterCount = Object.values(state.filters).filter(isFilterActive).length;

  const hasActiveFilters = activeFilterCount > 0;

  return {
    state,
    setState,
    setFilter,
    removeFilter,
    clearAll,
    setSort,
    activeFilterCount,
    hasActiveFilters,
  };
}
