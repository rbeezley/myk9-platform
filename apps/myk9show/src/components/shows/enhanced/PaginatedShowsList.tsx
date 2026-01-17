/**
 * Paginated Shows List Component
 * 
 * Enhanced shows list with role-based data scoping, pagination,
 * status filtering, and optimized performance for large datasets.
 */

import { useState, useMemo } from 'react';
import { useShowData, useShowScopedData } from '@/components/providers/ShowDataProvider';
import { useShowStore } from '@/store/showStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
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
  Calendar,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  RefreshCw,
  Download,
  MapPin
} from 'lucide-react';
import { createPaginationInfo } from '@/store/base/ShowScopedStore';
import type { Show } from '@/types/show-types';

interface PaginatedShowsListProps {
  /** Override default pagination size */
  pageSize?: number;
  /** Show search functionality */
  showSearch?: boolean;
  /** Show filters */
  showFilters?: boolean;
  /** Show export functionality */
  showExport?: boolean;
  /** Callback when show is selected for viewing */
  onViewShow?: (show: Show) => void;
  /** Callback when show is selected for editing */
  onEditShow?: (show: Show) => void;
  /** Callback when show is selected for deletion */
  onDeleteShow?: (show: Show) => void;
  /** Callback when show is selected (e.g., to switch context) */
  onSelectShow?: (show: Show) => void;
}

export function PaginatedShowsList({
  pageSize,
  showSearch = true,
  showFilters = true,
  showExport = true,
  onViewShow,
  onEditShow,
  onDeleteShow,
  onSelectShow,
}: PaginatedShowsListProps) {
  const { userRole, activeShowId, isLoading: showDataLoading } = useShowData();
  const shows = useShowStore(state => state.shows);
  
  // Get scoped and filtered data
  const { data: scopedShows, isLoading: showsLoading } = useShowScopedData(shows, 'shows');
  
  // Local state for pagination and filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'name' | 'startDate' | 'location' | 'status' | 'type'>('startDate');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); // Latest shows first

  // Calculate effective page size based on role
  const effectivePageSize = pageSize || (userRole === 'admin' ? 20 : userRole === 'secretary' ? 20 : 10);

  // Get unique statuses and types for filter dropdowns
  const availableStatuses = useMemo(() => {
    const statuses = [...new Set(scopedShows.map(show => show.status).filter(Boolean))];
    return statuses.sort();
  }, [scopedShows]);

  const availableTypes = useMemo(() => {
    const types = [...new Set(scopedShows.map(show => show.type).filter(Boolean))];
    return types.sort();
  }, [scopedShows]);

  // Filter and sort shows
  const filteredShows = useMemo(() => {
    const filtered = scopedShows.filter(show => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          show.name.toLowerCase().includes(query) ||
          show.location.toLowerCase().includes(query) ||
          show.clubName.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && show.status !== statusFilter) {
        return false;
      }

      // Type filter
      if (typeFilter !== 'all' && show.type !== typeFilter) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: string | number | Date | undefined = a[sortBy];
      let bValue: string | number | Date | undefined = b[sortBy];

      // Handle undefined values
      if (aValue === undefined) aValue = '';
      if (bValue === undefined) bValue = '';

      // Special handling for dates
      if (sortBy === 'startDate') {
        const aDate = new Date(aValue as string).getTime();
        const bDate = new Date(bValue as string).getTime();
        const comparison = aDate - bDate;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Default string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      const comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [scopedShows, searchQuery, statusFilter, typeFilter, sortBy, sortDirection]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredShows.length / effectivePageSize);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = startIndex + effectivePageSize;
  const paginatedShows = filteredShows.slice(startIndex, endIndex);
  
  const paginationInfo = createPaginationInfo(
    currentPage, 
    totalPages, 
    effectivePageSize, 
    filteredShows.length
  );

  // Reset to first page when filters change (render-time sync pattern)
  const filterKey = `${searchQuery}-${statusFilter}-${typeFilter}-${sortBy}-${sortDirection}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setCurrentPage(1);
  }

  // Get status badge configuration
  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'draft':
        return { label: 'Draft', color: 'bg-gray-100 text-gray-800' };
      case 'upcoming':
        return { label: 'Upcoming', color: 'bg-blue-100 text-blue-800' };
      case 'active':
        return { label: 'Active', color: 'bg-green-100 text-green-800' };
      case 'completed':
        return { label: 'Completed', color: 'bg-purple-100 text-purple-800' };
      case 'cancelled':
        return { label: 'Cancelled', color: 'bg-red-100 text-red-800' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' };
    }
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get days until show
  const getDaysUntilShow = (dateString: string): string => {
    if (!dateString) return '';
    const showDate = new Date(dateString);
    const today = new Date();
    const diffTime = showDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return 'Past';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    return `${diffDays} days`;
  };

  // Handle sort change
  const handleSort = (field: 'name' | 'startDate' | 'location' | 'status' | 'type') => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection(field === 'startDate' ? 'desc' : 'asc'); // Default to latest first for dates
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export function
  const handleExport = () => {
    const csvContent = [
      ['Name', 'Date', 'Location', 'Club', 'Status', 'Type', 'Entries', 'Classes'],
      ...filteredShows.map(show => [
        show.name,
        formatDate(show.startDate),
        show.location,
        show.clubName,
        show.status,
        show.type,
        '0', // Entries count - TODO: implement when entries are added to Show type
        show.trials?.reduce((total, trial) => total + (trial.classes?.length || 0), 0).toString() || '0',
      ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shows-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = showDataLoading || showsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading shows...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with stats and actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Shows ({filteredShows.length})
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Role: {userRole} • Page {currentPage} of {totalPages}
                {activeShowId && (
                  <span className="ml-2">• Active Show: {scopedShows.find(s => s.id === activeShowId)?.name || activeShowId}</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {showExport && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExport}
                  disabled={filteredShows.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => window.location.reload()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search and filters */}
          <div className="flex gap-4 mb-4">
            {showSearch && (
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search shows..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}
            
            {showFilters && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Status
                      {statusFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-2">
                          {statusFilter}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setStatusFilter('all')}>
                      All Statuses
                    </DropdownMenuItem>
                    {availableStatuses.map((status) => (
                      <DropdownMenuItem key={status} onClick={() => setStatusFilter(status)}>
                        {status}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Type
                      {typeFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-2">
                          {typeFilter}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setTypeFilter('all')}>
                      All Types
                    </DropdownMenuItem>
                    {availableTypes.map((type) => (
                      <DropdownMenuItem key={type} onClick={() => setTypeFilter(type)}>
                        {type}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Results table */}
          {paginatedShows.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No shows found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No shows match your current filters'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('name')}
                  >
                    Show Name
                    {sortBy === 'name' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('startDate')}
                  >
                    Date
                    {sortBy === 'startDate' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('location')}
                  >
                    Location
                    {sortBy === 'location' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Classes</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedShows.map((show) => {
                  const statusBadge = getStatusBadge(show.status);
                  const daysUntil = getDaysUntilShow(show.startDate);
                  const isActiveShow = activeShowId === show.id;
                  
                  return (
                    <TableRow 
                      key={show.id} 
                      className={`hover:bg-muted/50 ${isActiveShow ? 'bg-primary/5 border-primary/20' : ''}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {show.name}
                          {isActiveShow && (
                            <Badge variant="outline" className="text-xs">
                              Active
                            </Badge>
                          )}
                        </div>
                        {show.clubName && (
                          <div className="text-xs text-muted-foreground">
                            {show.clubName}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{formatDate(show.startDate)}</span>
                          {daysUntil && (
                            <span className="text-xs text-muted-foreground">
                              {daysUntil}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {show.location && (
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{show.location}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusBadge.color}>
                          {statusBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          0 {/* TODO: implement entries count when entries are added to Show type */}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {show.trials?.reduce((total, trial) => total + (trial.classes?.length || 0), 0) || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onSelectShow && (
                              <DropdownMenuItem
                                onClick={() => onSelectShow(show)}
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                {isActiveShow ? 'Current Show' : 'Switch to Show'}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => onViewShow?.(show)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditShow?.(show)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Show
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDeleteShow?.(show)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Show
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Showing {paginationInfo.startItem}-{paginationInfo.endItem} of {paginationInfo.totalItems} shows
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
        </CardContent>
      </Card>
    </div>
  );
}