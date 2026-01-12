/**
 * Virtual Scrolling List Component
 * 
 * High-performance virtual scrolling for large datasets. Only renders
 * visible items, dramatically improving performance for lists with
 * thousands of items.
 */

/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
import { logger } from '@/services/LoggingService';
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Search, Filter, RefreshCw, ArrowUp } from 'lucide-react';

interface VirtualScrollListProps<T> {
  /** All data items */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the scrollable container */
  containerHeight: number;
  /** Function to render each item */
  renderItem: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  /** Function to get unique key for each item */
  getItemKey: (item: T, index: number) => string;
  /** Optional search function */
  searchFunction?: (items: T[], query: string) => T[];
  /** Optional filters */
  filters?: Array<{
    id: string;
    name: string;
    options: { value: string; label: string }[];
  }>;
  /** Custom filter function */
  customFilter?: (item: T, filters: Record<string, string>) => boolean;
  /** List title */
  title?: string;
  /** Icon for the title */
  icon?: React.ComponentType<{ className?: string }>;
  /** Search placeholder */
  searchPlaceholder?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Empty message */
  emptyMessage?: string;
  /** Number of items to overscan (render outside viewport) */
  overscan?: number;
  /** Callback when scroll reaches near bottom */
  onScrollNearEnd?: () => void;
  /** Show scroll to top button after this scroll distance */
  scrollToTopThreshold?: number;
}

export function VirtualScrollList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  getItemKey,
  searchFunction,
  filters = [],
  customFilter,
  title = "Items",
  icon: Icon = Search,
  searchPlaceholder = "Search items...",
  isLoading = false,
  emptyMessage = "No items found",
  overscan = 5,
  onScrollNearEnd,
  scrollToTopThreshold = 500,
}: VirtualScrollListProps<T>) {
  // Refs
  const scrollElementRef = useRef<HTMLDivElement>(null);
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [scrollTop, setScrollTop] = useState(0);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  // Filter items based on search and filters
  const filteredItems = useMemo(() => {
    let result = items;

    // Apply search
    if (searchQuery.trim() && searchFunction) {
      result = searchFunction(result, searchQuery);
    }

    // Apply custom filters
    if (customFilter && Object.keys(activeFilters).length > 0) {
      result = result.filter(item => customFilter(item, activeFilters));
    }

    return result;
  }, [items, searchQuery, searchFunction, activeFilters, customFilter]);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const itemCount = filteredItems.length;
    const visibleItemsCount = Math.ceil(containerHeight / itemHeight);
    
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      itemCount - 1,
      startIndex + visibleItemsCount + 2 * overscan
    );

    return { startIndex, endIndex, visibleItemsCount };
  }, [filteredItems.length, containerHeight, itemHeight, scrollTop, overscan]);

  // Calculate total height and visible items
  const totalHeight = filteredItems.length * itemHeight;
  const visibleItems = filteredItems.slice(
    visibleRange.startIndex, 
    visibleRange.endIndex + 1
  );

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    setScrollTop(scrollTop);
    setShowScrollToTop(scrollTop > scrollToTopThreshold);

    // Check if near end for infinite loading
    if (onScrollNearEnd) {
      const { scrollHeight, clientHeight } = e.currentTarget;
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
      
      if (distanceFromBottom < itemHeight * 10) { // Within 10 items from bottom
        onScrollNearEnd();
      }
    }
  }, [itemHeight, onScrollNearEnd, scrollToTopThreshold]);

  // Scroll to top
  const scrollToTop = useCallback(() => {
    if (scrollElementRef.current) {
      scrollElementRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }, []);

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

  // Performance monitoring
  useEffect(() => {
    if (import.meta.env.DEV) {
      logger.debug(`🔄 Virtual scroll: ${visibleItems.length}/${filteredItems.length} items rendered`, 'components', {});
    }
  }, [visibleItems.length, filteredItems.length]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {title} ({filteredItems.length.toLocaleString()})
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Showing {visibleItems.length} of {filteredItems.length} • Virtual scrolling enabled
              </p>
            </div>
            
            <div className="flex gap-2">
              {(searchQuery || Object.keys(activeFilters).length > 0) && (
                <Button variant="outline" size="sm" onClick={clearAllFilters}>
                  Clear Filters
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Search and Filters */}
          <div className="flex gap-4 mb-4">
            {searchFunction && (
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
            )}
            
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
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ))}
          </div>

          {/* Virtual Scroll Container */}
          <div className="relative">
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading...
              </div>
            )}

            {filteredItems.length === 0 && !isLoading ? (
              <div className="text-center py-12">
                <Icon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">{emptyMessage}</h3>
                <p className="text-muted-foreground">
                  {searchQuery || Object.keys(activeFilters).length > 0
                    ? 'Try adjusting your search or filters'
                    : 'No items available'
                  }
                </p>
              </div>
            ) : (
              <div
                ref={scrollElementRef}
                className="overflow-auto border rounded-lg"
                style={{ height: containerHeight }}
                onScroll={handleScroll}
              >
                <div style={{ height: totalHeight, position: 'relative' }}>
                  {visibleItems.map((item, index) => {
                    const actualIndex = visibleRange.startIndex + index;
                    const style: React.CSSProperties = {
                      position: 'absolute',
                      top: actualIndex * itemHeight,
                      left: 0,
                      right: 0,
                      height: itemHeight,
                    };
                    
                    return (
                      <div key={getItemKey(item, actualIndex)} style={style}>
                        {renderItem(item, actualIndex, style)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Performance Stats */}
          {import.meta.env.DEV && (
            <div className="mt-4 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              Performance: Rendering {visibleItems.length} of {filteredItems.length} items 
              (Saved {((filteredItems.length - visibleItems.length) / Math.max(filteredItems.length, 1) * 100).toFixed(1)}% DOM nodes)
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scroll to Top Button */}
      {showScrollToTop && (
        <Button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 rounded-full shadow-lg z-50"
          size="sm"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Hook for calculating optimal item height based on content
 */
export function useItemHeight(sampleItem?: unknown): number {
  const [itemHeight, setItemHeight] = useState(60); // Default height

  useEffect(() => {
    if (sampleItem) {
      // Create a temporary element to measure height
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.visibility = 'hidden';
      tempDiv.style.height = 'auto';
      tempDiv.style.width = '100%';
      tempDiv.innerHTML = '<div>Sample content</div>'; // Replace with actual content
      
      document.body.appendChild(tempDiv);
      const height = tempDiv.offsetHeight;
      document.body.removeChild(tempDiv);
      
      if (height > 0) {
        setItemHeight(Math.max(height, 40)); // Minimum height
      }
    }
  }, [sampleItem]);

  return itemHeight;
}

/**
 * Hook for virtual scrolling with search and filtering
 */
export function useVirtualScrolling<T>(
  items: T[],
  searchFields: (keyof T)[],
  filterConfig?: {
    filters: Array<{ id: string; name: string; options: { value: string; label: string }[] }>;
    customFilter: (item: T, filters: Record<string, string>) => boolean;
  }
) {
  const searchFunction = useCallback((items: T[], query: string): T[] => {
    if (!query.trim()) return items;
    
    const lowercaseQuery = query.toLowerCase();
    return items.filter(item => 
      searchFields.some(field => {
        const value = item[field];
        return value && String(value).toLowerCase().includes(lowercaseQuery);
      })
    );
  }, [searchFields]);

  return {
    searchFunction,
    filters: filterConfig?.filters || [],
    customFilter: filterConfig?.customFilter,
  };
}