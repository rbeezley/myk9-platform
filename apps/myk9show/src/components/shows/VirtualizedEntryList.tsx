/**
 * Virtualized Entry List Component for handling large datasets efficiently
 */

import React, { useMemo, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Filter,
  SortAsc,
  SortDesc,
  Eye,
  Edit,
  Trash2,
  Dog,
  User,
  Calendar
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePagination, useDebouncedSearch } from '@/hooks/usePerformanceOptimization';

export interface EntryData {
  id: string;
  dogName: string;
  ownerName: string;
  className: string;
  status: 'submitted' | 'confirmed' | 'paid' | 'withdrawn';
  entryFee: number;
  createdAt: string;
  ringNumber?: number;
  armband?: string;
  checkInTime?: string;
}

export interface VirtualizedEntryListProps {
  entries: EntryData[];
  onEntryClick?: (entry: EntryData) => void;
  onEntryEdit?: (entry: EntryData) => void;
  onEntryDelete?: (entry: EntryData) => void;
  className?: string;
  height?: number;
  enableSearch?: boolean;
  enableFilters?: boolean;
  enableSorting?: boolean;
  pageSize?: number;
}

interface EntryRowProps {
  index: number;
  style: React.CSSProperties;
  data: {
    entries: EntryData[];
    onEntryClick?: (entry: EntryData) => void;
    onEntryEdit?: (entry: EntryData) => void;
    onEntryDelete?: (entry: EntryData) => void;
  };
}

const EntryRow: React.FC<EntryRowProps> = ({ index, style, data }) => {
  const { entries, onEntryClick, onEntryEdit, onEntryDelete } = data;
  const entry = entries[index];

  if (!entry) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'confirmed':
        return 'bg-blue-100 text-blue-800';
      case 'submitted':
        return 'bg-yellow-100 text-yellow-800';
      case 'withdrawn':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div style={style} className="px-4">
      <Card className="h-[80px] hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="flex items-center justify-between p-4 h-full">
          <div className="flex items-center gap-4 flex-1">
            <div className="flex items-center gap-2">
              <Dog className="h-5 w-5 text-blue-500" />
              <div>
                <div className="font-medium">{entry.dogName}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {entry.ownerName}
                </div>
              </div>
            </div>

            <div className="flex-1">
              <div className="font-medium">{entry.className}</div>
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                {entry.ringNumber && (
                  <span>Ring {entry.ringNumber}</span>
                )}
                {entry.armband && (
                  <span>#{entry.armband}</span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(entry.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="text-right">
              <div className="font-medium">{formatCurrency(entry.entryFee)}</div>
              <Badge className={cn('text-xs', getStatusColor(entry.status))}>
                {entry.status}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-4">
            {onEntryClick && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEntryClick(entry);
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            )}
            {onEntryEdit && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onEntryEdit(entry);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onEntryDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:text-red-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onEntryDelete(entry);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export function VirtualizedEntryList({
  entries,
  onEntryClick,
  onEntryEdit,
  onEntryDelete,
  className,
  height = 600,
  enableSearch = true,
  enableFilters = true,
  enableSorting = true,
  pageSize = 50
}: VirtualizedEntryListProps) {
  // Search functionality
  const searchEntries = useCallback(async (query: string) => {
    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async search
    return entries.filter(entry =>
      entry.dogName.toLowerCase().includes(query.toLowerCase()) ||
      entry.ownerName.toLowerCase().includes(query.toLowerCase()) ||
      entry.className.toLowerCase().includes(query.toLowerCase()) ||
      entry.armband?.includes(query)
    );
  }, [entries]);

  const {
    query,
    setQuery,
    results: searchResults,
    loading: searchLoading
  } = useDebouncedSearch(searchEntries, 300);

  // Pagination and filtering
  const pagination = usePagination({
    data: query ? searchResults : entries,
    page: 1,
    pageSize: pageSize * 10, // Load more items for virtual scrolling
    sortBy: 'createdAt',
    sortDirection: 'desc',
    filters: {},
    autoRefresh: true,
    refreshInterval: 30000
  });

  // Memoized data for virtual list
  const listData = useMemo(() => ({
    entries: (pagination.result?.data || []) as EntryData[],
    onEntryClick,
    onEntryEdit,
    onEntryDelete
  }), [pagination.result?.data, onEntryClick, onEntryEdit, onEntryDelete]);

  const handleSortChange = useCallback((field: string) => {
    pagination.updateSort(field);
  }, [pagination]);

  // const handleFilterChange = useCallback((filters: Record<string, unknown>) => {
  //   pagination.updateFilters(filters);
  // }, [pagination]);

  const visibleEntries = listData.entries;
  const itemCount = visibleEntries.length;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search and Filter Controls */}
      {(enableSearch || enableFilters) && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {enableSearch && (
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entries by dog, owner, class, or armband..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-10"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    </div>
                  )}
                </div>
              )}

              {enableSorting && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSortChange('dogName')}
                    className="flex items-center gap-1"
                  >
                    {pagination.sortDirection === 'asc' ? (
                      <SortAsc className="h-4 w-4" />
                    ) : (
                      <SortDesc className="h-4 w-4" />
                    )}
                    Dog Name
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSortChange('createdAt')}
                    className="flex items-center gap-1"
                  >
                    {pagination.sortDirection === 'asc' ? (
                      <SortAsc className="h-4 w-4" />
                    ) : (
                      <SortDesc className="h-4 w-4" />
                    )}
                    Date
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSortChange('entryFee')}
                    className="flex items-center gap-1"
                  >
                    {pagination.sortDirection === 'asc' ? (
                      <SortAsc className="h-4 w-4" />
                    ) : (
                      <SortDesc className="h-4 w-4" />
                    )}
                    Fee
                  </Button>
                </div>
              )}

              {enableFilters && (
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {visibleEntries.length} of {pagination.totalItems} entries
          {query && ` matching "${query}"`}
        </div>
        <div className="flex items-center gap-2">
          {pagination.loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
              Loading...
            </div>
          )}
        </div>
      </div>

      {/* Virtualized List */}
      <Card>
        <CardContent className="p-0">
          {itemCount > 0 ? (
            <List
              height={height}
              width="100%"
              itemCount={itemCount}
              itemSize={88} // 80px item + 8px spacing
              itemData={listData}
              overscanCount={5}
            >
              {EntryRow}
            </List>
          ) : (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Dog className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">
                  {query ? `No entries found matching "${query}"` : 'No entries found'}
                </p>
                {query && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuery('')}
                    className="mt-2"
                  >
                    Clear Search
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance Stats (Development Only) */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="border-dashed">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground grid grid-cols-4 gap-4">
              <div>Total: {pagination.totalItems}</div>
              <div>Visible: {itemCount}</div>
              <div>Page: {pagination.page}</div>
              <div>Loading: {pagination.loading ? 'Yes' : 'No'}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}