import { useState, useCallback, useMemo } from 'react';

export interface FilterOption {
  label: string;
  value: unknown;
  count?: number;
}

export interface FilterDefinition {
  key: string;
  label: string;
  type: 'text' | 'select' | 'multiSelect' | 'date' | 'dateRange' | 'number' | 'boolean';
  options?: FilterOption[];
  placeholder?: string;
  multiple?: boolean;
}

export interface ActiveFilter {
  key: string;
  value: unknown;
  label: string;
  displayValue: string;
}

export interface DateRangeValue {
  start: string | null;
  end: string | null;
}

interface UseFilterStateProps<T> {
  data: T[];
  filterDefinitions: FilterDefinition[];
  searchFields?: (keyof T)[];
  defaultFilters?: Record<string, unknown>;
}

export function useFilterState<T extends Record<string, unknown>>({
  data,
  filterDefinitions,
  searchFields = [],
  defaultFilters = {},
}: UseFilterStateProps<T>) {
  // Filter state
  const [filters, setFilters] = useState<Record<string, unknown>>(defaultFilters);
  const [searchTerm, setSearchTerm] = useState('');

  // Set a single filter
  const setFilter = useCallback((key: string, value: unknown) => {
    setFilters(prev => {
      if (value === null || value === undefined || value === '' || 
          (Array.isArray(value) && value.length === 0)) {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      }
      return { ...prev, [key]: value };
    });
  }, []);

  // Set multiple filters at once
  const setMultipleFilters = useCallback((newFilters: Record<string, unknown>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Clear a single filter
  const clearFilter = useCallback((key: string) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[key];
      return newFilters;
    });
  }, []);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setFilters({});
    setSearchTerm('');
  }, []);

  // Toggle a value in a multi-select filter
  const toggleFilterValue = useCallback((key: string, value: unknown) => {
    setFilters(prev => {
      const currentValue = prev[key] || [];
      const isArray = Array.isArray(currentValue);
      
      if (!isArray) {
        return { ...prev, [key]: [value] };
      }

      const newValue = currentValue.includes(value)
        ? currentValue.filter((v: unknown) => v !== value)
        : [...currentValue, value];

      if (newValue.length === 0) {
        const newFilters = { ...prev };
        delete newFilters[key];
        return newFilters;
      }

      return { ...prev, [key]: newValue };
    });
  }, []);

  // Apply search to data
  const applySearch = useCallback((items: T[], term: string): T[] => {
    if (!term.trim()) return items;

    const searchLower = term.toLowerCase();
    return items.filter(item => {
      // Search in specified fields
      if (searchFields.length > 0) {
        return searchFields.some(field => {
          const value = item[field];
          return value && String(value).toLowerCase().includes(searchLower);
        });
      }

      // Search in all fields if no specific fields specified
      return Object.values(item).some(value => 
        value && String(value).toLowerCase().includes(searchLower)
      );
    });
  }, [searchFields]);

  // Apply filters to data
  const applyFilters = useCallback((items: T[], filterState: Record<string, unknown>): T[] => {
    return items.filter(item => {
      return Object.entries(filterState).every(([key, filterValue]) => {
        const itemValue = item[key];
        const filterDef = filterDefinitions.find(def => def.key === key);

        if (!filterDef) return true;

        switch (filterDef.type) {
          case 'text':
            return itemValue && String(itemValue).toLowerCase().includes(String(filterValue).toLowerCase());

          case 'select':
            return itemValue === filterValue;

          case 'multiSelect':
            if (!Array.isArray(filterValue)) return true;
            return filterValue.includes(itemValue);

          case 'boolean':
            return Boolean(itemValue) === Boolean(filterValue);

          case 'number': {
            const numValue = Number(itemValue);
            const numFilter = Number(filterValue);
            return !isNaN(numValue) && !isNaN(numFilter) && numValue === numFilter;
          }

          case 'date': {
            if (!itemValue || !filterValue) return true;
            const itemDate = new Date(itemValue as string | number | Date).toDateString();
            const filterDate = new Date(filterValue as string | number | Date).toDateString();
            return itemDate === filterDate;
          }

          case 'dateRange': {
            if (!itemValue || !filterValue) return true;
            const { start, end } = filterValue as DateRangeValue;
            if (!start && !end) return true;
            
            const itemDateTime = new Date(itemValue as string | number | Date).getTime();
            if (start && itemDateTime < new Date(start).getTime()) return false;
            if (end && itemDateTime > new Date(end).getTime()) return false;
            return true;
          }

          default:
            return true;
        }
      });
    });
  }, [filterDefinitions]);

  // Get filtered data
  const filteredData = useMemo(() => {
    let result = data;
    
    // Apply search first
    result = applySearch(result, searchTerm);
    
    // Then apply filters
    result = applyFilters(result, filters);
    
    return result;
  }, [data, searchTerm, filters, applySearch, applyFilters]);

  // Get active filters for display
  const activeFilters = useMemo((): ActiveFilter[] => {
    return Object.entries(filters).map(([key, value]) => {
      const filterDef = filterDefinitions.find(def => def.key === key);
      const label = filterDef?.label || key;

      let displayValue: string;
      
      if (Array.isArray(value)) {
        if (filterDef?.options) {
          const selectedOptions = filterDef.options.filter(opt => value.includes(opt.value));
          displayValue = selectedOptions.map(opt => opt.label).join(', ');
        } else {
          displayValue = value.join(', ');
        }
      } else if (filterDef?.type === 'dateRange') {
        const { start, end } = value as DateRangeValue;
        if (start && end) {
          displayValue = `${start} - ${end}`;
        } else if (start) {
          displayValue = `From ${start}`;
        } else if (end) {
          displayValue = `Until ${end}`;
        } else {
          displayValue = '';
        }
      } else if (filterDef?.options) {
        const option = filterDef.options.find(opt => opt.value === value);
        displayValue = option?.label || String(value);
      } else {
        displayValue = String(value);
      }

      return {
        key,
        value,
        label,
        displayValue,
      };
    });
  }, [filters, filterDefinitions]);

  // Get filter options with counts
  const getFilterOptionsWithCounts = useCallback((filterKey: string) => {
    const filterDef = filterDefinitions.find(def => def.key === filterKey);
    if (!filterDef?.options) return [];

    // Count occurrences in current data (before this filter is applied)
    const otherFilters = { ...filters };
    delete otherFilters[filterKey];
    const dataForCounting = applyFilters(applySearch(data, searchTerm), otherFilters);

    return filterDef.options.map(option => {
      const count = dataForCounting.filter(item => item[filterKey] === option.value).length;
      return { ...option, count };
    });
  }, [data, filters, searchTerm, filterDefinitions, applySearch, applyFilters]);

  // Check if filters are active
  const hasActiveFilters = useMemo(() => {
    return Object.keys(filters).length > 0 || searchTerm.trim() !== '';
  }, [filters, searchTerm]);

  // Get filter statistics
  const filterStats = useMemo(() => {
    return {
      totalItems: data.length,
      filteredItems: filteredData.length,
      activeFilterCount: activeFilters.length,
      hasSearch: searchTerm.trim() !== '',
    };
  }, [data.length, filteredData.length, activeFilters.length, searchTerm]);

  return {
    // Data
    filteredData,
    originalData: data,

    // Filter state
    filters,
    searchTerm,
    activeFilters,
    hasActiveFilters,

    // Actions
    setFilter,
    setMultipleFilters,
    clearFilter,
    clearAllFilters,
    toggleFilterValue,
    setSearchTerm,

    // Utilities
    getFilterOptionsWithCounts,
    filterStats,

    // Filter definitions
    filterDefinitions,
  };
}