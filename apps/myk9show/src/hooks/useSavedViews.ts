/**
 * useSavedViews — Manage saved filter/view configurations for browse pages.
 *
 * Persists views to localStorage (will migrate to Supabase saved_views table
 * once auth-scoped persistence is needed).
 */

import { useState, useCallback, useMemo } from 'react';
import { STORAGE_KEYS } from '@/constants/storageKeys';

export interface ViewConfig {
  /** Active filter values (key → value). */
  filters: Record<string, string>;
  /** View mode (grid, list, calendar, kanban). */
  viewMode?: string;
  /** Active tab key. */
  tab?: string;
  /** Sort column. */
  sortColumn?: string;
  /** Sort direction. */
  sortDirection?: 'asc' | 'desc';
}

export interface SavedView {
  id: string;
  name: string;
  config: ViewConfig;
  isDefault: boolean;
  createdAt: string;
}

function loadViews(pageKey: string): SavedView[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.SAVED_VIEWS_PREFIX}:${pageKey}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistViews(pageKey: string, views: SavedView[]) {
  try {
    localStorage.setItem(`${STORAGE_KEYS.SAVED_VIEWS_PREFIX}:${pageKey}`, JSON.stringify(views));
  } catch {
    /* quota exceeded — silently ignore */
  }
}

export function useSavedViews(pageKey: string) {
  const [views, setViews] = useState<SavedView[]>(() => loadViews(pageKey));
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const activeView = useMemo(
    () => views.find(v => v.id === activeViewId) ?? null,
    [views, activeViewId]
  );

  const saveView = useCallback(
    (name: string, config: ViewConfig) => {
      const newView: SavedView = {
        id: crypto.randomUUID(),
        name,
        config,
        isDefault: false,
        createdAt: new Date().toISOString(),
      };
      setViews(prev => {
        const next = [...prev, newView];
        persistViews(pageKey, next);
        return next;
      });
      setActiveViewId(newView.id);
      return newView;
    },
    [pageKey]
  );

  const updateView = useCallback(
    (id: string, config: ViewConfig) => {
      setViews(prev => {
        const next = prev.map(v => (v.id === id ? { ...v, config } : v));
        persistViews(pageKey, next);
        return next;
      });
    },
    [pageKey]
  );

  const deleteView = useCallback(
    (id: string) => {
      setViews(prev => {
        const next = prev.filter(v => v.id !== id);
        persistViews(pageKey, next);
        return next;
      });
      if (activeViewId === id) setActiveViewId(null);
    },
    [pageKey, activeViewId]
  );

  const setDefault = useCallback(
    (id: string) => {
      setViews(prev => {
        const next = prev.map(v => ({ ...v, isDefault: v.id === id }));
        persistViews(pageKey, next);
        return next;
      });
    },
    [pageKey]
  );

  const applyView = useCallback((id: string) => {
    setActiveViewId(id);
  }, []);

  const clearActiveView = useCallback(() => {
    setActiveViewId(null);
  }, []);

  return {
    views,
    activeView,
    activeViewId,
    saveView,
    updateView,
    deleteView,
    setDefault,
    applyView,
    clearActiveView,
  };
}
