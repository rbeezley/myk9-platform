/**
 * Paginated Users List Component
 * 
 * Enhanced people list with role-based data scoping, pagination,
 * and optimized performance for large datasets.
 */

import React, { useState, useMemo } from 'react';
import { useShowData, useShowScopedData } from '@/components/providers/ShowDataProvider';
import { useUserStore } from '@/store/userStore';
import { useDogStore } from '@/store/dogStore';
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
  Users,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  RefreshCw,
  Download
} from 'lucide-react';
import type { User } from '@/types/dog-types';
import { createPaginationInfo } from '@/store/base/ShowScopedStore';

interface PaginatedPeopleListProps {
  /** Override default pagination size */
  pageSize?: number;
  /** Show search functionality */
  showSearch?: boolean;
  /** Show filters */
  showFilters?: boolean;
  /** Show export functionality */
  showExport?: boolean;
  /** Callback when person is selected for viewing */
  onViewPerson?: (person: User) => void;
  /** Callback when person is selected for editing */
  onEditPerson?: (person: User) => void;
  /** Callback when person is selected for deletion */
  onDeletePerson?: (person: User) => void;
}

export function PaginatedPeopleList({
  pageSize,
  showSearch = true,
  showFilters = true,
  showExport = true,
  onViewPerson,
  onEditPerson,
  onDeletePerson,
}: PaginatedPeopleListProps) {
  const { userRole, activeShowId, isLoading: showDataLoading } = useShowData();
  const people = useUserStore(state => state.people);
  const dogs = useDogStore(state => state.dogs);
  
  // Get scoped and filtered data
  const { data: scopedPeople, isLoading: peopleLoading } = useShowScopedData(people, 'people');
  
  // Local state for pagination and filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<keyof User>('lastName');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Calculate effective page size based on role
  const effectivePageSize = pageSize || (userRole === 'admin' ? 50 : userRole === 'secretary' ? 50 : 25);

  // Filter and sort people
  const filteredPeople = useMemo(() => {
    const filtered = scopedPeople.filter(person => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          person.firstName.toLowerCase().includes(query) ||
          person.lastName.toLowerCase().includes(query) ||
          person.email.toLowerCase().includes(query) ||
          person.phone?.includes(query) ||
          person.city?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Role filter (if applicable)
      if (roleFilter !== 'all') {
        // This would filter by person's role in the show
        // For now, we'll use a simple dog ownership filter
        if (roleFilter === 'exhibitors') {
          const personDogs = dogs.filter(dog => dog.ownerId === person.id);
          if (personDogs.length === 0) return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];

      // Handle undefined values
      if (aValue === undefined) aValue = '';
      if (bValue === undefined) bValue = '';

      // Convert to string for comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      const comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [scopedPeople, searchQuery, roleFilter, sortBy, sortDirection, dogs]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredPeople.length / effectivePageSize);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = startIndex + effectivePageSize;
  const paginatedPeople = filteredPeople.slice(startIndex, endIndex);
  
  const paginationInfo = createPaginationInfo(
    currentPage, 
    totalPages, 
    effectivePageSize, 
    filteredPeople.length
  );

  // Reset to first page when filters change using render-time sync
  const filterKey = `${searchQuery}-${roleFilter}-${sortBy}-${sortDirection}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setCurrentPage(1);
  }

  // Get person's dog count for display
  const getPersonDogCount = (personId: string): number => {
    return dogs.filter(dog => dog.ownerId === personId).length;
  };

  // Get person's role badge
  const getPersonRoleBadge = (person: User) => {
    const dogCount = getPersonDogCount(person.id);
    if (dogCount > 0) return { label: 'Exhibitor', color: 'bg-blue-100 text-blue-800' };
    // Add more role logic based on your business rules
    return { label: 'Contact', color: 'bg-gray-100 text-gray-800' };
  };

  // Handle sort change
  const handleSort = (field: keyof User) => {
    if (sortBy === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDirection('asc');
    }
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export function (basic implementation)
  const handleExport = () => {
    const csvContent = [
      ['First Name', 'Last Name', 'Email', 'Phone', 'City', 'Dogs'],
      ...filteredPeople.map(person => [
        person.firstName,
        person.lastName,
        person.email,
        person.phone || '',
        person.city || '',
        getPersonDogCount(person.id).toString(),
      ])
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `people-${activeShowId || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = showDataLoading || peopleLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading people...
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
                <Users className="h-5 w-5" />
                Users ({filteredPeople.length})
              </CardTitle>
              {activeShowId && (
                <p className="text-sm text-muted-foreground mt-1">
                  Show context • Role: {userRole} • Page {currentPage} of {totalPages}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {showExport && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleExport}
                  disabled={filteredPeople.length === 0}
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
                    placeholder="Search people..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}
            
            {showFilters && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setRoleFilter('all')}>
                    All Users
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRoleFilter('exhibitors')}>
                    Exhibitors Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Results table */}
          {paginatedPeople.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No people found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No people match your current filters'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('firstName')}
                  >
                    First Name
                    {sortBy === 'firstName' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('lastName')}
                  >
                    Last Name
                    {sortBy === 'lastName' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('email')}
                  >
                    Email
                    {sortBy === 'email' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Dogs</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedPeople.map((person) => {
                  const roleBadge = getPersonRoleBadge(person);
                  const dogCount = getPersonDogCount(person.id);
                  
                  return (
                    <TableRow key={person.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {person.firstName}
                      </TableCell>
                      <TableCell>{person.lastName}</TableCell>
                      <TableCell>
                        <a 
                          href={`mailto:${person.email}`}
                          className="text-primary hover:underline"
                        >
                          {person.email}
                        </a>
                      </TableCell>
                      <TableCell>
                        {person.phone && (
                          <a 
                            href={`tel:${person.phone}`}
                            className="text-primary hover:underline"
                          >
                            {person.phone}
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        {person.city && person.state ? 
                          `${person.city}, ${person.state}` : 
                          person.city || person.state || '—'
                        }
                      </TableCell>
                      <TableCell>
                        <Badge className={roleBadge.color}>
                          {roleBadge.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dogCount > 0 ? (
                          <Badge variant="outline">
                            {dogCount} {dogCount === 1 ? 'dog' : 'dogs'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onViewPerson?.(person)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditPerson?.(person)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit User
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDeletePerson?.(person)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete User
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
                Showing {paginationInfo.startItem}-{paginationInfo.endItem} of {paginationInfo.totalItems} people
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