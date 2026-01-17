/**
 * Paginated Dogs List Component
 * 
 * Enhanced dogs list with role-based data scoping, pagination,
 * breed filtering, and optimized performance for large datasets.
 */

import React, { useState, useMemo } from 'react';
import { useShowData, useShowScopedData } from '@/components/providers/ShowDataProvider';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
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
  Heart,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  RefreshCw,
  Download
} from 'lucide-react';
import type { Dog } from '@/types/dog-types';
import { createPaginationInfo } from '@/store/base/ShowScopedStore';

interface PaginatedDogsListProps {
  /** Override default pagination size */
  pageSize?: number;
  /** Show search functionality */
  showSearch?: boolean;
  /** Show filters */
  showFilters?: boolean;
  /** Show export functionality */
  showExport?: boolean;
  /** Callback when dog is selected for viewing */
  onViewDog?: (dog: Dog) => void;
  /** Callback when dog is selected for editing */
  onEditDog?: (dog: Dog) => void;
  /** Callback when dog is selected for deletion */
  onDeleteDog?: (dog: Dog) => void;
}

export function PaginatedDogsList({
  pageSize,
  showSearch = true,
  showFilters = true,
  showExport = true,
  onViewDog,
  onEditDog,
  onDeleteDog,
}: PaginatedDogsListProps) {
  const { userRole, activeShowId, isLoading: showDataLoading } = useShowData();
  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  
  // Get scoped and filtered data
  const { data: scopedDogs, isLoading: dogsLoading } = useShowScopedData(dogs, 'dogs');
  
  // Local state for pagination and filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [breedFilter, setBreedFilter] = useState<string>('all');
  const [sexFilter, setSexFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<keyof Dog>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Calculate effective page size based on role
  const effectivePageSize = pageSize || (userRole === 'admin' ? 50 : userRole === 'secretary' ? 50 : 20);

  // Get unique breeds for filter dropdown
  const availableBreeds = useMemo(() => {
    const breeds = [...new Set(scopedDogs.map(dog => dog.breed).filter(Boolean))];
    return breeds.sort();
  }, [scopedDogs]);

  // Filter and sort dogs
  const filteredDogs = useMemo(() => {
    const filtered = scopedDogs.filter(dog => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const ownerName = people.find(p => p.id === dog.ownerId);
        const matchesSearch = 
          dog.name.toLowerCase().includes(query) ||
          dog.breed.toLowerCase().includes(query) ||
          dog.color?.toLowerCase().includes(query) ||
          dog.microchipNumber?.includes(query) ||
          ownerName?.firstName.toLowerCase().includes(query) ||
          ownerName?.lastName.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }

      // Breed filter
      if (breedFilter !== 'all' && dog.breed !== breedFilter) {
        return false;
      }

      // Sex filter
      if (sexFilter !== 'all' && dog.sex !== sexFilter) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: string | number | undefined;
      let bValue: string | number | undefined;
      
      // Handle complex properties that aren't directly sortable
      if (sortBy === 'name') {
        aValue = a.name;
        bValue = b.name;
      } else if (sortBy === 'breed') {
        aValue = a.breed;
        bValue = b.breed;
      } else if (sortBy === 'sex') {
        aValue = a.sex;
        bValue = b.sex;
      } else if (sortBy === 'age') {
        aValue = a.age;
        bValue = b.age;
      } else if (sortBy === 'ownerName') {
        aValue = a.ownerName;
        bValue = b.ownerName;
      } else {
        aValue = '';
        bValue = '';
      }

      // Handle undefined values
      if (aValue === undefined) aValue = '';
      if (bValue === undefined) bValue = '';

      // Special handling for different data types
      if (sortBy === 'name' || sortBy === 'breed' || sortBy === 'color') {
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        const comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (sortBy === 'weight' || sortBy === 'height') {
        const aNum = Number(aValue) || 0;
        const bNum = Number(bValue) || 0;
        const comparison = aNum - bNum;
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      // Default string comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      const comparison = aStr < bStr ? -1 : aStr > bStr ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [scopedDogs, searchQuery, breedFilter, sexFilter, sortBy, sortDirection, people]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredDogs.length / effectivePageSize);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = startIndex + effectivePageSize;
  const paginatedDogs = filteredDogs.slice(startIndex, endIndex);
  
  const paginationInfo = createPaginationInfo(
    currentPage, 
    totalPages, 
    effectivePageSize, 
    filteredDogs.length
  );

  // Reset to first page when filters change - use comparison during render
  const filterKey = `${searchQuery}-${breedFilter}-${sexFilter}-${sortBy}-${sortDirection}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setCurrentPage(1);
  }

  // Get owner name for display
  const getOwnerName = (ownerId: string): string => {
    const owner = people.find(p => p.id === ownerId);
    return owner ? `${owner.firstName} ${owner.lastName}` : 'Unknown Owner';
  };

  // Get registration status
  const getRegistrationStatus = (dog: Dog) => {
    if (!dog.registrations || dog.registrations.length === 0) {
      return { label: 'Unregistered', color: 'bg-gray-100 text-gray-800' };
    }
    
    const activeRegs = dog.registrations.filter(r => r.status === 'Active');
    if (activeRegs.length > 0) {
      return { 
        label: `${activeRegs[0].organization}`, 
        color: 'bg-green-100 text-green-800' 
      };
    }
    
    return { label: 'Inactive', color: 'bg-yellow-100 text-yellow-800' };
  };

  // Get age from birthDate
  const getAge = (birthDate: string): string => {
    if (!birthDate) return 'Unknown';
    
    const birth = new Date(birthDate);
    const today = new Date();
    const ageYears = today.getFullYear() - birth.getFullYear();
    const ageMonths = today.getMonth() - birth.getMonth();
    
    if (ageYears === 0) {
      return `${Math.max(1, ageMonths)} months`;
    } else if (ageYears === 1 && ageMonths < 0) {
      return `${12 + ageMonths} months`;
    } else {
      return `${ageYears} years`;
    }
  };

  // Handle sort change
  const handleSort = (field: keyof Dog) => {
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

  // Export function
  const handleExport = () => {
    const csvContent = [
      ['Name', 'Breed', 'Sex', 'Age', 'Owner', 'Registration', 'Microchip'],
      ...filteredDogs.map(dog => {
        const regStatus = getRegistrationStatus(dog);
        return [
          dog.name,
          dog.breed,
          dog.sex,
          getAge(dog.birthDate),
          getOwnerName(dog.ownerId),
          regStatus.label,
          dog.microchipNumber || '',
        ];
      })
    ].map(row => row.map(field => `"${field}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dogs-${activeShowId || 'all'}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = showDataLoading || dogsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading dogs...
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
                <Heart className="h-5 w-5" />
                Dogs ({filteredDogs.length})
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
                  disabled={filteredDogs.length === 0}
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
                    placeholder="Search dogs..."
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
                      Breed
                      {breedFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-2">
                          {breedFilter}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setBreedFilter('all')}>
                      All Breeds
                    </DropdownMenuItem>
                    {availableBreeds.map((breed) => (
                      <DropdownMenuItem key={breed} onClick={() => setBreedFilter(breed)}>
                        {breed}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Filter className="h-4 w-4 mr-2" />
                      Sex
                      {sexFilter !== 'all' && (
                        <Badge variant="secondary" className="ml-2">
                          {sexFilter}
                        </Badge>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setSexFilter('all')}>
                      All
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSexFilter('male')}>
                      Male
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSexFilter('female')}>
                      Female
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>

          {/* Results table */}
          {paginatedDogs.length === 0 ? (
            <div className="text-center py-8">
              <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No dogs found</h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Try adjusting your search criteria' : 'No dogs match your current filters'}
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
                    Name
                    {sortBy === 'name' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort('breed')}
                  >
                    Breed
                    {sortBy === 'breed' && (
                      <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </TableHead>
                  <TableHead>Sex</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead className="w-12">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDogs.map((dog) => {
                  const regStatus = getRegistrationStatus(dog);
                  
                  return (
                    <TableRow key={dog.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {dog.name}
                        {dog.color && (
                          <div className="text-xs text-muted-foreground">
                            {dog.color}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{dog.breed}</TableCell>
                      <TableCell>
                        <Badge variant={dog.sex === 'male' ? 'default' : 'secondary'}>
                          {dog.sex}
                        </Badge>
                      </TableCell>
                      <TableCell>{getAge(dog.birthDate)}</TableCell>
                      <TableCell>{getOwnerName(dog.ownerId)}</TableCell>
                      <TableCell>
                        <Badge className={regStatus.color}>
                          {regStatus.label}
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
                            <DropdownMenuItem
                              onClick={() => onViewDog?.(dog)}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onEditDog?.(dog)}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Dog
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDeleteDog?.(dog)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete Dog
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
                Showing {paginationInfo.startItem}-{paginationInfo.endItem} of {paginationInfo.totalItems} dogs
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