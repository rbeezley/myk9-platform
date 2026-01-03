import { useState, useCallback, useMemo } from 'react';

export interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
}

export interface FilterConfig {
  [key: string]: unknown;
}

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  sortable?: boolean;
  filterable?: boolean;
}

export interface SelectionConfig {
  selectedIds: string[];
  selectAll: boolean;
  mode: 'single' | 'multiple' | 'none';
}

interface UseTableStateProps<T> {
  data: T[];
  initialPageSize?: number;
  defaultSortKey?: string;
  defaultSortDirection?: 'asc' | 'desc';
  selectionMode?: 'single' | 'multiple' | 'none';
  columns?: ColumnConfig[];
}

export function useTableState<T extends { id: string }>({
  data,
  initialPageSize = 10,
  defaultSortKey,
  defaultSortDirection = 'asc',
  selectionMode = 'none',
  columns = [],
}: UseTableStateProps<T>) {
  // Sorting state
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(
    defaultSortKey ? { key: defaultSortKey, direction: defaultSortDirection } : null
  );

  // Pagination state
  const [pagination, setPagination] = useState<PaginationConfig>({
    page: 1,
    pageSize: initialPageSize,
    total: data.length,
  });

  // Filtering state
  const [filters, setFilters] = useState<FilterConfig>({});

  // Column visibility state
  const [columnConfig, setColumnConfig] = useState<ColumnConfig[]>(columns);

  // Selection state
  const [selection, setSelection] = useState<SelectionConfig>({
    selectedIds: [],
    selectAll: false,
    mode: selectionMode,
  });

  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting functions
  const handleSort = useCallback((key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return prev.direction === 'asc' 
          ? { key, direction: 'desc' }
          : null; // Reset to no sort
      }
      return { key, direction: 'asc' };
    });
  }, []);

  const clearSort = useCallback(() => {
    setSortConfig(null);
  }, []);

  // Filtering functions
  const setFilter = useCallback((key: string, value: unknown) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
    }));
    // Reset to first page when filtering
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const clearFilter = useCallback((key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({});
    setSearchTerm('');
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Pagination functions
  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination(prev => ({ ...prev, pageSize, page: 1 }));
  }, []);

  // Selection functions
  const toggleRowSelection = useCallback((id: string) => {
    if (selection.mode === 'none') return;

    setSelection(prev => {
      if (prev.mode === 'single') {
        return {
          ...prev,
          selectedIds: prev.selectedIds.includes(id) ? [] : [id],
          selectAll: false,
        };
      }

      // Multiple selection
      const isSelected = prev.selectedIds.includes(id);
      const newSelectedIds = isSelected
        ? prev.selectedIds.filter(selectedId => selectedId !== id)
        : [...prev.selectedIds, id];

      return {
        ...prev,
        selectedIds: newSelectedIds,
        selectAll: newSelectedIds.length === data.length && data.length > 0,
      };
    });
  }, [selection.mode, data.length]);

  const toggleSelectAll = useCallback(() => {
    if (selection.mode !== 'multiple') return;

    setSelection(prev => ({
      ...prev,
      selectedIds: prev.selectAll ? [] : data.map(item => item.id),
      selectAll: !prev.selectAll,
    }));
  }, [selection.mode, data]);

  const clearSelection = useCallback(() => {
    setSelection(prev => ({
      ...prev,
      selectedIds: [],
      selectAll: false,
    }));
  }, []);

  // Column visibility functions
  const toggleColumnVisibility = useCallback((key: string) => {
    setColumnConfig(prev => 
      prev.map(col => 
        col.key === key ? { ...col, visible: !col.visible } : col
      )
    );
  }, []);

  const showAllColumns = useCallback(() => {
    setColumnConfig(prev => prev.map(col => ({ ...col, visible: true })));
  }, []);

  const hideAllColumns = useCallback(() => {
    setColumnConfig(prev => prev.map(col => ({ ...col, visible: false })));
  }, []);

  // Data processing
  const processedData = useMemo(() => {
    let result = [...data];

    // Apply search
    if (searchTerm) {
      result = result.filter(item =>
        Object.values(item).some(value =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Apply filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        result = result.filter(item => {
          const itemValue = (item as Record<string, unknown>)[key];
          if (Array.isArray(value)) {
            return value.includes(itemValue);
          }
          return String(itemValue).toLowerCase().includes(String(value).toLowerCase());
        });
      }
    });

    // Apply sorting
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = (a as any)[sortConfig.key]; // eslint-disable-line @typescript-eslint/no-explicit-any
        const bValue = (b as any)[sortConfig.key]; // eslint-disable-line @typescript-eslint/no-explicit-any

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, filters, sortConfig]);

  // Paginated data
  const paginatedData = useMemo(() => {
    const startIndex = (pagination.page - 1) * pagination.pageSize;
    const endIndex = startIndex + pagination.pageSize;
    return processedData.slice(startIndex, endIndex);
  }, [processedData, pagination.page, pagination.pageSize]);

  // Update total when processed data changes
  useMemo(() => {
    setPagination(prev => ({ ...prev, total: processedData.length }));
  }, [processedData.length]);

  // Computed values
  const totalPages = Math.ceil(processedData.length / pagination.pageSize);
  const hasSelection = selection.selectedIds.length > 0;
  const isAllSelected = selection.selectAll && processedData.length > 0;
  const visibleColumns = columnConfig.filter(col => col.visible);

  return {
    // Data
    data: paginatedData,
    processedData,
    totalItems: processedData.length,

    // Sorting
    sortConfig,
    handleSort,
    clearSort,

    // Filtering
    filters,
    setFilter,
    clearFilter,
    clearAllFilters,
    searchTerm,
    setSearchTerm,

    // Pagination
    pagination,
    setPage,
    setPageSize,
    totalPages,

    // Selection
    selection,
    toggleRowSelection,
    toggleSelectAll,
    clearSelection,
    hasSelection,
    isAllSelected,

    // Columns
    columnConfig,
    visibleColumns,
    toggleColumnVisibility,
    showAllColumns,
    hideAllColumns,

    // Computed
    isEmpty: processedData.length === 0,
    isLoading: false, // Can be enhanced to accept loading state
  };
}