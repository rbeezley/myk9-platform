/**
 * Virtual Dogs List Component
 * 
 * High-performance virtual scrolling implementation for very large
 * dog datasets. Ideal for admin users who need to browse thousands
 * of dogs efficiently.
 */

import React from 'react';
import { VirtualScrollList, useVirtualScrolling } from '@/components/common/virtual/VirtualScrollList';
import { useShowScopedData } from '@/components/providers/ShowDataProvider';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Heart, MoreVertical, Eye, Edit, Trash2 } from 'lucide-react';
import type { Dog } from '@/types/dog-types';

interface VirtualDogsListProps {
  /** Container height for virtual scrolling */
  containerHeight?: number;
  /** Callback when dog is selected for viewing */
  onViewDog?: (dog: Dog) => void;
  /** Callback when dog is selected for editing */
  onEditDog?: (dog: Dog) => void;
  /** Callback when dog is selected for deletion */
  onDeleteDog?: (dog: Dog) => void;
  /** Show admin features */
  showAdminFeatures?: boolean;
}

export function VirtualDogsList({
  containerHeight = 600,
  onViewDog,
  onEditDog,
  onDeleteDog,
  showAdminFeatures = false,
}: VirtualDogsListProps) {
  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  
  // Get scoped data (this will be filtered based on role)
  const { data: scopedDogs, isLoading } = useShowScopedData(dogs, 'dogs');

  // Set up virtual scrolling with search and filters
  const { searchFunction, filters, customFilter } = useVirtualScrolling(
    scopedDogs,
    ['name', 'breed', 'color'],
    {
      filters: [
        {
          id: 'breed',
          name: 'Breed',
          options: [
            { value: 'all', label: 'All Breeds' },
            ...getUniqueBreeds(scopedDogs).map(breed => ({
              value: breed,
              label: breed,
            }))
          ],
        },
        {
          id: 'sex',
          name: 'Sex',
          options: [
            { value: 'all', label: 'All' },
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ],
        },
        {
          id: 'registration',
          name: 'Registration',
          options: [
            { value: 'all', label: 'All' },
            { value: 'registered', label: 'Registered' },
            { value: 'unregistered', label: 'Unregistered' },
          ],
        },
      ],
      customFilter: (dog: Dog, filters: Record<string, string>) => {
        if (filters.breed && filters.breed !== 'all' && dog.breed !== filters.breed) {
          return false;
        }
        if (filters.sex && filters.sex !== 'all' && dog.sex !== filters.sex) {
          return false;
        }
        if (filters.registration && filters.registration !== 'all') {
          const hasRegistration = dog.registrations && dog.registrations.length > 0;
          if (filters.registration === 'registered' && !hasRegistration) return false;
          if (filters.registration === 'unregistered' && hasRegistration) return false;
        }
        return true;
      },
    }
  );

  // Helper functions
  const getOwnerName = (ownerId: string): string => {
    const owner = people.find(p => p.id === ownerId);
    return owner ? `${owner.firstName} ${owner.lastName}` : 'Unknown Owner';
  };

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

  // Render individual dog item
  const renderDogItem = (dog: Dog, index: number, style: React.CSSProperties) => {
    const regStatus = getRegistrationStatus(dog);
    
    return (
      <div 
        style={style} 
        className="flex items-center justify-between px-4 py-3 border-b hover:bg-muted/50"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Dog Image Placeholder */}
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Heart className="h-6 w-6 text-muted-foreground" />
          </div>
          
          {/* Dog Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">{dog.name}</h3>
              <Badge variant={dog.sex === 'male' ? 'default' : 'secondary'} className="text-xs">
                {dog.sex}
              </Badge>
              <Badge className={`text-xs ${regStatus.color}`}>
                {regStatus.label}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{dog.breed}</span>
              <span>{getAge(dog.birthDate)}</span>
              <span className="truncate">{getOwnerName(dog.ownerId)}</span>
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {dog.color && (
            <Badge variant="outline" className="text-xs">
              {dog.color}
            </Badge>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewDog?.(dog)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditDog?.(dog)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit Dog
              </DropdownMenuItem>
              {showAdminFeatures && (
                <DropdownMenuItem
                  onClick={() => onDeleteDog?.(dog)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Dog
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  return (
    <VirtualScrollList
      items={scopedDogs}
      itemHeight={80} // Height of each dog item
      containerHeight={containerHeight}
      renderItem={renderDogItem}
      getItemKey={(dog) => dog.id}
      searchFunction={searchFunction}
      filters={filters}
      customFilter={customFilter}
      title="Dogs"
      icon={Heart}
      searchPlaceholder="Search dogs by name, breed, or owner..."
      isLoading={isLoading}
      emptyMessage="No dogs found"
      overscan={10} // Render extra items for smooth scrolling
    />
  );
}

/**
 * Get unique breeds from dog list
 */
function getUniqueBreeds(dogs: Dog[]): string[] {
  const breeds = new Set(dogs.map(dog => dog.breed).filter(Boolean));
  return Array.from(breeds).sort();
}

/**
 * High-performance dogs list for admin users
 * Optimized for datasets with 10,000+ dogs
 */
export function AdminVirtualDogsList(props: Omit<VirtualDogsListProps, 'showAdminFeatures'>) {
  return (
    <VirtualDogsList
      {...props}
      containerHeight={800} // Larger container for admin
      showAdminFeatures={true}
    />
  );
}

/**
 * Compact dogs list for smaller spaces
 */
export function CompactVirtualDogsList(props: VirtualDogsListProps) {
  const renderCompactItem = (dog: Dog, index: number, style: React.CSSProperties) => {
    const regStatus = getRegistrationStatus(dog);
    
    return (
      <div 
        style={style} 
        className="flex items-center justify-between px-3 py-2 border-b hover:bg-muted/50"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Heart className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{dog.name}</span>
              <Badge variant="outline" className="text-xs">
                {dog.breed}
              </Badge>
              <Badge className={`text-xs ${regStatus.color}`}>
                {regStatus.label}
              </Badge>
            </div>
          </div>
        </div>
        
        <Button variant="ghost" size="sm" onClick={() => props.onViewDog?.(dog)}>
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <VirtualScrollList
      items={useDogStore(state => state.dogs)}
      itemHeight={50} // Smaller height for compact view
      containerHeight={props.containerHeight || 400}
      renderItem={renderCompactItem}
      getItemKey={(dog) => dog.id}
      title="Dogs"
      icon={Heart}
      searchPlaceholder="Search dogs..."
      emptyMessage="No dogs found"
      overscan={15} // More overscan for smaller items
    />
  );
}

// Helper function for registration status (reused from other components)
function getRegistrationStatus(dog: Dog) {
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
}