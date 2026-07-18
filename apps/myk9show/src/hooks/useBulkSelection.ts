import { useState, useCallback, useMemo, useEffect } from 'react';

export interface UseBulkSelectionOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
  onSelectionChange?: (selectedItems: T[]) => void;
  /**
   * When true, selections for items no longer present in `items` are dropped.
   * Prevents stale selections from resurfacing when a filter is removed (e.g.
   * select rows → filter them out → clear the filter — they must not reappear
   * selected and become bulk-editable by accident).
   */
  pruneToItems?: boolean;
  /**
   * Opaque identity string for the current "view" (filters, preset, scope).
   * When this value changes between renders, the whole selection is cleared —
   * not just pruned. Design Decision 4 (operational-views-and-display-presets):
   * changing what view a secretary is looking at must not leave a stale
   * selection that a bulk action could silently apply to. Omit to disable.
   */
  resetKey?: string;
}

export function useBulkSelection<T>({
  items,
  getItemId,
  onSelectionChange,
  pruneToItems = false,
  resetKey,
}: UseBulkSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear the whole selection when the view identity changes, during render
  // (the adjust-state-during-render pattern — not a useEffect, which the repo
  // lints against). Converges: after clearing, prevResetKey matches
  // resetKey, so this branch is skipped on the next render.
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  const viewIdentityChanged = resetKey !== undefined && resetKey !== prevResetKey;
  if (viewIdentityChanged) {
    setPrevResetKey(resetKey);
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
    }
  }

  // Prune stale selections during render (the adjust-state-during-render pattern —
  // not a useEffect, which the repo lints against). Converges: after pruning,
  // every selected id is present, so this branch is skipped on the next render.
  // Skipped when the view identity just changed above — that already clears
  // the whole selection, and `selectedIds` here would still be this render's
  // stale (pre-clear) value, which would otherwise clobber the clear.
  if (!viewIdentityChanged && pruneToItems && selectedIds.size > 0) {
    const presentIds = new Set(items.map(getItemId));
    let hasStale = false;
    for (const id of selectedIds) {
      if (!presentIds.has(id)) {
        hasStale = true;
        break;
      }
    }
    if (hasStale) {
      setSelectedIds(prev => {
        const next = new Set<string>();
        prev.forEach(id => {
          if (presentIds.has(id)) next.add(id);
        });
        return next;
      });
    }
  }

  // Get selected items
  const selectedItems = useMemo(() => {
    return items.filter(item => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  // Selection state checks
  const isSelected = useCallback(
    (item: T) => {
      return selectedIds.has(getItemId(item));
    },
    [selectedIds, getItemId]
  );

  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every(item => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  const isPartiallySelected = useMemo(() => {
    return selectedIds.size > 0 && !isAllSelected;
  }, [selectedIds.size, isAllSelected]);

  // Selection actions
  const selectItem = useCallback(
    (item: T) => {
      const id = getItemId(item);
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.add(id);
        return newSet;
      });
    },
    [getItemId]
  );

  const deselectItem = useCallback(
    (item: T) => {
      const id = getItemId(item);
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    },
    [getItemId]
  );

  const toggleItem = useCallback(
    (item: T) => {
      if (isSelected(item)) {
        deselectItem(item);
      } else {
        selectItem(item);
      }
    },
    [isSelected, selectItem, deselectItem]
  );

  const selectAll = useCallback(() => {
    const allIds = items.map(getItemId);
    setSelectedIds(new Set(allIds));
  }, [items, getItemId]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      deselectAll();
    } else {
      selectAll();
    }
  }, [isAllSelected, selectAll, deselectAll]);

  const selectItems = useCallback(
    (itemsToSelect: T[]) => {
      const idsToSelect = itemsToSelect.map(getItemId);
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        idsToSelect.forEach(id => newSet.add(id));
        return newSet;
      });
    },
    [getItemId]
  );

  const deselectItems = useCallback(
    (itemsToDeselect: T[]) => {
      const idsToDeselect = itemsToDeselect.map(getItemId);
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        idsToDeselect.forEach(id => newSet.delete(id));
        return newSet;
      });
    },
    [getItemId]
  );

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Call onSelectionChange when selection changes
  useEffect(() => {
    onSelectionChange?.(selectedItems);
  }, [selectedItems, onSelectionChange]);

  return {
    selectedItems,
    selectedIds,
    selectedCount: selectedIds.size,
    isSelected,
    isAllSelected,
    isPartiallySelected,
    selectItem,
    deselectItem,
    toggleItem,
    selectAll,
    deselectAll,
    toggleAll,
    selectItems,
    deselectItems,
    clearSelection,
  };
}
