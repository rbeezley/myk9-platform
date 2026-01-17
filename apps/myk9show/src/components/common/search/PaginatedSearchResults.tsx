/**
 * Paginated Search Results Component
 * 
 * A generic component for displaying paginated search results across
 * different data types with role-based filtering and performance optimization.
 */

/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useMemo } from 'react';
import { useShowData } from '@/components/providers/ShowDataProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Filter,
  RefreshCw,
  X
} from 'lucide-react';
import { createPaginationInfo } from '@/store/base/ShowScopedStore';
import { getPaginationForRole } from '@/services/data-scoping/role-profiles';

interface SearchFilter {
  id: string;
  name: string;
  options: { value: string; label: string; count?: number }[];
}

interface PaginatedSearchResultsProps<T> {
  /** Data to search through */
  data: T[];
  /** Function to render each item */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Function to search items */
  searchFunction: (items: T[], query: string) => T[];
  /** Optional filters */
  filters?: SearchFilter[];
  /** Optional custom filter function */
  customFilter?: (item: T, filters: Record<string, string>) => boolean;
  /** Function to get a unique key for each item */
  getItemKey: (item: T) => string;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Title for the results */
  title?: string;
  /** Icon component for the title */
  icon?: React.ComponentType<{ className?: string }>;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: string | null;
  /** Override pagination size */
  pageSize?: number;
  /** Data type for role-based pagination */
  dataType?: string;
  /** Show export functionality */
  showExport?: boolean;
  /** Export function */
  onExport?: (filteredData: T[]) => void;
}

export function PaginatedSearchResults<T>({
  data,
  renderItem,
  searchFunction,
  filters = [],
  customFilter,
  getItemKey,
  searchPlaceholder = "Search...",
  title = "Results",
  icon: Icon = Search,
  emptyMessage = "No results found",
  isLoading = false,
  error = null,
  pageSize,
  dataType = 'default',
  showExport = false,
  onExport,
}: PaginatedSearchResultsProps<T>) {
  const { userRole } = useShowData();
  
  // Local state
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  // Calculate effective page size
  const effectivePageSize = pageSize || getPaginationForRole(userRole || 'exhibitor', dataType);

  // Apply search and filters
  const filteredData = useMemo(() => {
    let results = data;

    // Apply search
    if (searchQuery.trim()) {
      results = searchFunction(results, searchQuery);
    }

    // Apply filters
    if (customFilter && Object.keys(activeFilters).length > 0) {
      results = results.filter(item => customFilter(item, activeFilters));
    }

    return results;
  }, [data, searchQuery, searchFunction, activeFilters, customFilter]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredData.length / effectivePageSize);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = startIndex + effectivePageSize;
  const paginatedData = filteredData.slice(startIndex, endIndex);
  
  const paginationInfo = createPaginationInfo(
    currentPage, 
    totalPages, 
    effectivePageSize, 
    filteredData.length
  );

  // Reset page when search/filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilters]);

  // Filter management
  const setFilter = (filterId: string, value: string) => {
    setActiveFilters(prev => {
      if (value === 'all') {
        const { [filterId]: _, ...rest } = prev;
        void _; // Mark as intentionally unused
        return rest;
      }
      return { ...prev, [filterId]: value };
    });
  };

  const clearAllFilters = () => {
    setActiveFilters({});
    setSearchQuery('');
  };

  const hasActiveFilters = searchQuery.trim() || Object.keys(activeFilters).length > 0;

  // Page change handler
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export handler
  const handleExport = () => {
    if (onExport) {
      onExport(filteredData);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-red-500">
            <p>Error: {error}</p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {title} ({filteredData.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Page {currentPage} of {totalPages} • {userRole} view
              </p>
            </div>
            
            <div className="flex gap-2">
              {showExport && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExport}
                  disabled={filteredData.length === 0 || !onExport}
                >
                  Export Results
                </Button>
              )}
              {hasActiveFilters && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={clearAllFilters}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Search and filters */}
          <div className="flex gap-4 mb-6">
            {/* Search input */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* Filters */}
            {filters.map((filter) => (
              <DropdownMenu key={filter.id}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    {filter.name}
                    {activeFilters[filter.id] && (
                      <Badge variant="secondary" className="ml-2">
                        {filter.options.find(opt => opt.value === activeFilters[filter.id])?.label}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setFilter(filter.id, 'all')}>
                    All {filter.name}
                  </DropdownMenuItem>
                  {filter.options.map((option) => (
                    <DropdownMenuItem 
                      key={option.value} 
                      onClick={() => setFilter(filter.id, option.value)}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span>{option.label}</span>
                        {option.count !== undefined && (
                          <Badge variant="outline" className="ml-2">
                            {option.count}
                          </Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>

          {/* Active filters display */}
          {Object.keys(activeFilters).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {Object.entries(activeFilters).map(([filterId, value]) => {
                const filter = filters.find(f => f.id === filterId);
                const option = filter?.options.find(opt => opt.value === value);
                return (
                  <Badge key={filterId} variant="secondary" className="flex items-center gap-1">
                    {filter?.name}: {option?.label}
                    <button
                      onClick={() => setFilter(filterId, 'all')}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              Loading...
            </div>
          )}

          {/* Results */}
          {!isLoading && (
            <>
              {paginatedData.length === 0 ? (
                <div className="text-center py-8">
                  <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">{emptyMessage}</h3>
                  <p className="text-muted-foreground">
                    {hasActiveFilters ? 
                      'Try adjusting your search criteria or filters' : 
                      'No data available'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paginatedData.map((item, index) => (
                    <div key={getItemKey(item)}>
                      {renderItem(item, startIndex + index)}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Showing {paginationInfo.startItem}-{paginationInfo.endItem} of {paginationInfo.totalItems} results
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={!paginationInfo.hasPreviousPage}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={!paginationInfo.hasNextPage}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Helper hook for common search scenarios
 */
export function useSearchableData<T>(
  _data: T[],
  searchFields: (keyof T)[],
  filterOptions?: {
    filters: SearchFilter[];
    customFilter: (item: T, filters: Record<string, string>) => boolean;
  }
) {
  const searchFunction = (items: T[], query: string): T[] => {
    if (!query.trim()) return items;
    
    const lowercaseQuery = query.toLowerCase();
    return items.filter(item => 
      searchFields.some(field => {
        const value = item[field];
        return value && String(value).toLowerCase().includes(lowercaseQuery);
      })
    );
  };

  return {
    searchFunction,
    filters: filterOptions?.filters || [],
    customFilter: filterOptions?.customFilter,
  };
}