import { useState, useCallback, useMemo } from 'react';

export interface UseBulkSelectionOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
  onSelectionChange?: (selectedItems: T[]) => void;
}

export function useBulkSelection<T>({
  items,
  getItemId,
  onSelectionChange,
}: UseBulkSelectionOptions<T>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Get selected items
  const selectedItems = useMemo(() => {
    return items.filter(item => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  // Selection state checks
  const isSelected = useCallback((item: T) => {
    return selectedIds.has(getItemId(item));
  }, [selectedIds, getItemId]);

  const isAllSelected = useMemo(() => {
    return items.length > 0 && items.every(item => selectedIds.has(getItemId(item)));
  }, [items, selectedIds, getItemId]);

  const isPartiallySelected = useMemo(() => {
    return selectedIds.size > 0 && !isAllSelected;
  }, [selectedIds.size, isAllSelected]);

  // Selection actions
  const selectItem = useCallback((item: T) => {
    const id = getItemId(item);
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.add(id);
      return newSet;
    });
  }, [getItemId]);

  const deselectItem = useCallback((item: T) => {
    const id = getItemId(item);
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  }, [getItemId]);

  const toggleItem = useCallback((item: T) => {
    if (isSelected(item)) {
      deselectItem(item);
    } else {
      selectItem(item);
    }
  }, [isSelected, selectItem, deselectItem]);

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

  const selectItems = useCallback((itemsToSelect: T[]) => {
    const idsToSelect = itemsToSelect.map(getItemId);
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      idsToSelect.forEach(id => newSet.add(id));
      return newSet;
    });
  }, [getItemId]);

  const deselectItems = useCallback((itemsToDeselect: T[]) => {
    const idsToDeselect = itemsToDeselect.map(getItemId);
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      idsToDeselect.forEach(id => newSet.delete(id));
      return newSet;
    });
  }, [getItemId]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Call onSelectionChange when selection changes
  useMemo(() => {
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