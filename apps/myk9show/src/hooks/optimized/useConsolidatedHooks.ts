/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Consolidated hooks that combine common patterns to reduce hook count
 * and improve performance through better memoization
 */

import { useState, useMemo } from 'react';

/**
 * Consolidated table management hook that combines sorting, filtering, 
 * pagination, and selection in an optimized way
 */
export interface TableState<T> {
  // Data
  data: T[];
  filtered: T[];
  sorted: T[];
  paginated: T[];
  
  // Sort
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  
  // Filter
  filters: Record<string, unknown>;
  searchTerm: string;
  
  // Pagination
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  
  // Selection
  selectedIds: string[];
  isAllSelected: boolean;
  
  // Loading/Error
  loading: boolean;
  error: string | null;
}

export interface TableActions<T> {
  // Sort
  setSortKey: (key: string) => void;
  toggleSort: (key: string) => void;
  
  // Filter
  setFilter: (key: string, value: unknown) => void;
  setFilters: (filters: Record<string, unknown>) => void;
  setSearchTerm: (term: string) => void;
  clearFilters: () => void;
  
  // Pagination
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  
  // Selection
  selectItem: (id: string) => void;
  deselectItem: (id: string) => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  
  // Data
  setData: (data: T[]) => void;
  refreshData: () => Promise<void>;
}

export function useConsolidatedTable<T extends { id: string }>(
  initialData: T[] = [],
  dataLoader?: () => Promise<T[]>,
  options?: {
    initialPageSize?: number;
    defaultSortKey?: string;
    defaultSortDirection?: 'asc' | 'desc';
    searchFields?: (keyof T)[];
  }
): { state: TableState<T>; actions: TableActions<T> } {
  const {
    initialPageSize = 10,
    defaultSortKey = '',
    defaultSortDirection = 'asc',
    searchFields = []
  } = options || {};

  // Base data state
  const [data, setData] = useState<T[]>(initialData);
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey || null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoized filtered data based on search and filters
  const filtered = useMemo(() => {
    let result = data;

    // Apply search
    if (searchTerm && searchFields.length > 0) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      result = result.filter(item =>
        searchFields.some(field => {
          const value = item[field];
          return String(value).toLowerCase().includes(lowerSearchTerm);
        })
      );
    }

    // Apply filters
    result = result.filter(item => {
      return Object.entries(filters).every(([key, filterValue]) => {
        if (filterValue === null || filterValue === undefined || filterValue === '') {
          return true;
        }
        const itemValue = item[key as keyof T];
        return itemValue === filterValue;
      });
    });

    return result;
  }, [data, searchTerm, filters, searchFields]);

  // Memoized sorted data
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];
      
      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;
      
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [filtered, sortKey, sortDirection]);

  // Memoized pagination data
  const { paginated, totalPages, totalItems } = useMemo(() => {
    const total = sorted.length;
    const pages = Math.ceil(total / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    return {
      paginated: sorted.slice(startIndex, endIndex),
      totalPages: pages,
      totalItems: total
    };
  }, [sorted, currentPage, pageSize]);

  // Selection helpers
  const isAllSelected = useMemo(() => {
    return paginated.length > 0 && paginated.every(item => selectedIds.includes(item.id));
  }, [paginated, selectedIds]);

  // Actions
  const actions = useMemo<TableActions<T>>(() => ({
    // Sort actions
    setSortKey: (key: string) => {
      if (sortKey === key) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSortKey(key);
        setSortDirection('asc');
      }
      setCurrentPage(1); // Reset to first page when sorting
    },
    
    toggleSort: (key: string) => {
      if (sortKey === key) {
        setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
      } else {
        setSortKey(key);
        setSortDirection('asc');
      }
      setCurrentPage(1);
    },
    
    // Filter actions
    setFilter: (key: string, value: unknown) => {
      setFilters(prev => ({ ...prev, [key]: value }));
      setCurrentPage(1);
    },
    
    setFilters: (newFilters: Record<string, unknown>) => {
      setFilters(newFilters);
      setCurrentPage(1);
    },
    
    setSearchTerm: (term: string) => {
      setSearchTerm(term);
      setCurrentPage(1);
    },
    
    clearFilters: () => {
      setFilters({});
      setSearchTerm('');
      setCurrentPage(1);
    },
    
    // Pagination actions
    setPage: (page: number) => {
      setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    },
    
    setPageSize: (size: number) => {
      setPageSize(size);
      setCurrentPage(1);
    },
    
    nextPage: () => {
      setCurrentPage(prev => Math.min(prev + 1, totalPages));
    },
    
    prevPage: () => {
      setCurrentPage(prev => Math.max(prev - 1, 1));
    },
    
    // Selection actions
    selectItem: (id: string) => {
      setSelectedIds(prev => prev.includes(id) ? prev : [...prev, id]);
    },
    
    deselectItem: (id: string) => {
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    },
    
    toggleSelection: (id: string) => {
      setSelectedIds(prev => 
        prev.includes(id) 
          ? prev.filter(selectedId => selectedId !== id)
          : [...prev, id]
      );
    },
    
    selectAll: () => {
      const pageIds = paginated.map(item => item.id);
      setSelectedIds(prev => [...new Set([...prev, ...pageIds])]);
    },
    
    deselectAll: () => {
      const pageIds = new Set(paginated.map(item => item.id));
      setSelectedIds(prev => prev.filter(id => !pageIds.has(id)));
    },
    
    // Data actions
    setData: (newData: T[]) => {
      setData(newData);
      setCurrentPage(1);
      setSelectedIds([]);
    },
    
    refreshData: async () => {
      if (!dataLoader) return;
      
      try {
        setLoading(true);
        setError(null);
        const newData = await dataLoader();
        setData(newData);
        setCurrentPage(1);
        setSelectedIds([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
  }), [
    sortKey, totalPages, paginated, dataLoader
  ]);

  const state: TableState<T> = {
    data,
    filtered,
    sorted,
    paginated,
    sortKey,
    sortDirection,
    filters,
    searchTerm,
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    selectedIds,
    isAllSelected,
    loading,
    error
  };

  return { state, actions };
}

/**
 * Consolidated modal/dialog hook that manages multiple modal states
 */
export interface ModalState {
  [modalId: string]: {
    isOpen: boolean;
    data?: unknown;
  };
}

export interface ModalActions {
  openModal: (modalId: string, data?: unknown) => void;
  closeModal: (modalId: string) => void;
  toggleModal: (modalId: string, data?: unknown) => void;
  closeAllModals: () => void;
  isModalOpen: (modalId: string) => boolean;
  getModalData: <T = unknown>(modalId: string) => T | undefined;
}

export function useConsolidatedModals(
  initialModals: string[] = []
): { state: ModalState; actions: ModalActions } {
  const [modalState, setModalState] = useState<ModalState>(
    initialModals.reduce((acc, modalId) => ({
      ...acc,
      [modalId]: { isOpen: false }
    }), {})
  );

  const actions = useMemo<ModalActions>(() => ({
    openModal: (modalId: string, data?: unknown) => {
      setModalState(prev => ({
        ...prev,
        [modalId]: { isOpen: true, data }
      }));
    },
    
    closeModal: (modalId: string) => {
      setModalState(prev => ({
        ...prev,
        [modalId]: { isOpen: false, data: undefined }
      }));
    },
    
    toggleModal: (modalId: string, data?: unknown) => {
      setModalState(prev => {
        const currentModal = prev[modalId];
        return {
          ...prev,
          [modalId]: {
            isOpen: !currentModal?.isOpen,
            data: currentModal?.isOpen ? undefined : data
          }
        };
      });
    },
    
    closeAllModals: () => {
      setModalState(prev => {
        const closed: ModalState = {};
        Object.keys(prev).forEach(modalId => {
          closed[modalId] = { isOpen: false, data: undefined };
        });
        return closed;
      });
    },
    
    isModalOpen: (modalId: string): boolean => {
      return modalState[modalId]?.isOpen || false;
    },
    
    getModalData: <T = unknown>(modalId: string): T | undefined => {
      return modalState[modalId]?.data as T;
    }
  }), [modalState]);

  return { state: modalState, actions };
}