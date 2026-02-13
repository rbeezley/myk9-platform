/**
 * Virtual Users List Component
 * 
 * High-performance virtual scrolling implementation for large
 * people datasets. Optimized for handling thousands of contacts
 * with smooth scrolling performance.
 */

import React from 'react';
import { VirtualScrollList, useVirtualScrolling } from '@/components/common/virtual/VirtualScrollList';
import { useShowScopedData } from '@/components/providers/ShowDataProvider';
import { useUserStore } from '@/store/userStore';
import { useDogStore } from '@/store/dogStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, MoreVertical, Eye, Edit, Trash2, Phone, Mail, MapPin } from 'lucide-react';
import type { User } from '@/types/dog-types';

interface VirtualPeopleListProps {
  /** Container height for virtual scrolling */
  containerHeight?: number;
  /** Callback when person is selected for viewing */
  onViewPerson?: (person: User) => void;
  /** Callback when person is selected for editing */
  onEditPerson?: (person: User) => void;
  /** Callback when person is selected for deletion */
  onDeletePerson?: (person: User) => void;
  /** Show admin features */
  showAdminFeatures?: boolean;
  /** Show contact actions */
  showContactActions?: boolean;
}

export function VirtualPeopleList({
  containerHeight = 600,
  onViewPerson,
  onEditPerson,
  onDeletePerson,
  showAdminFeatures = false,
  showContactActions = true,
}: VirtualPeopleListProps) {
  const people = useUserStore(state => state.people);
  const dogs = useDogStore(state => state.dogs);
  
  // Get scoped data (filtered based on role)
  const { data: scopedPeople, isLoading } = useShowScopedData(people, 'people');

  // Set up virtual scrolling with search and filters
  const { searchFunction, filters, customFilter } = useVirtualScrolling(
    scopedPeople,
    ['firstName', 'lastName', 'email', 'phone', 'city'],
    {
      filters: [
        {
          id: 'role',
          name: 'Role',
          options: [
            { value: 'all', label: 'All Users' },
            { value: 'exhibitors', label: 'Exhibitors' },
            { value: 'contacts', label: 'Contacts Only' },
          ],
        },
        {
          id: 'state',
          name: 'State',
          options: [
            { value: 'all', label: 'All States' },
            ...getUniqueStates(scopedPeople).map(state => ({
              value: state,
              label: state,
            }))
          ],
        },
        {
          id: 'dogOwnership',
          name: 'Dog Ownership',
          options: [
            { value: 'all', label: 'All' },
            { value: 'has-dogs', label: 'Has Dogs' },
            { value: 'no-dogs', label: 'No Dogs' },
          ],
        },
      ],
      customFilter: (person: User, filters: Record<string, string>) => {
        // Role filter
        if (filters.role && filters.role !== 'all') {
          const personDogs = dogs.filter(dog => dog.ownerId === person.id);
          if (filters.role === 'exhibitors' && personDogs.length === 0) return false;
          if (filters.role === 'contacts' && personDogs.length > 0) return false;
        }
        
        // State filter
        if (filters.state && filters.state !== 'all' && person.state !== filters.state) {
          return false;
        }
        
        // Dog ownership filter
        if (filters.dogOwnership && filters.dogOwnership !== 'all') {
          const personDogs = dogs.filter(dog => dog.ownerId === person.id);
          if (filters.dogOwnership === 'has-dogs' && personDogs.length === 0) return false;
          if (filters.dogOwnership === 'no-dogs' && personDogs.length > 0) return false;
        }
        
        return true;
      },
    }
  );

  // Helper functions
  const getPersonDogCount = (personId: string): number => {
    return dogs.filter(dog => dog.ownerId === personId).length;
  };

  const getPersonRoleBadge = (person: User) => {
    const dogCount = getPersonDogCount(person.id);
    if (dogCount > 0) {
      return { 
        label: `Exhibitor (${dogCount} dog${dogCount !== 1 ? 's' : ''})`, 
        color: 'bg-blue-100 text-blue-800' 
      };
    }
    return { label: 'Contact', color: 'bg-gray-100 text-gray-800' };
  };

  const formatLocation = (person: User): string => {
    if (person.city && person.state) {
      return `${person.city}, ${person.state}`;
    }
    return person.city || person.state || '';
  };

  // Render individual person item
  const renderPersonItem = (person: User, index: number, style: React.CSSProperties) => {
    const roleBadge = getPersonRoleBadge(person);
    const location = formatLocation(person);
    
    return (
      <div 
        style={style} 
        className="flex items-center justify-between px-4 py-3 border-b hover:bg-muted/50"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Profile Picture Placeholder */}
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          
          {/* User Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">
                {person.firstName} {person.lastName}
              </h3>
              <Badge className={`text-xs ${roleBadge.color}`}>
                {roleBadge.label}
              </Badge>
            </div>
            
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {person.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-48">{person.email}</span>
                </div>
              )}
              
              {person.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{person.phone}</span>
                </div>
              )}
              
              {location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span className="truncate max-w-32">{location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {showContactActions && (
            <div className="flex gap-1">
              {person.email && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => window.location.href = `mailto:${person.email}`}
                  title={`Email ${person.firstName}`}
                >
                  <Mail className="h-4 w-4" />
                </Button>
              )}
              
              {person.phone && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => window.location.href = `tel:${person.phone}`}
                  title={`Call ${person.firstName}`}
                >
                  <Phone className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onViewPerson?.(person)}>
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditPerson?.(person)}>
                <Edit className="h-4 w-4 mr-2" />
                Edit User
              </DropdownMenuItem>
              {showAdminFeatures && (
                <DropdownMenuItem
                  onClick={() => onDeletePerson?.(person)}
                  className="text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
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
      items={scopedPeople}
      itemHeight={90} // Height of each person item
      containerHeight={containerHeight}
      renderItem={renderPersonItem}
      getItemKey={(person) => person.id}
      searchFunction={searchFunction}
      filters={filters}
      customFilter={customFilter}
      title="Users"
      icon={Users}
      searchPlaceholder="Search people by name, email, phone, or location..."
      isLoading={isLoading}
      emptyMessage="No people found"
      overscan={8} // Render extra items for smooth scrolling
    />
  );
}

/**
 * High-performance people list for admin users
 * Optimized for datasets with 10,000+ contacts
 */
export function AdminVirtualPeopleList(props: Omit<VirtualPeopleListProps, 'showAdminFeatures'>) {
  return (
    <VirtualPeopleList
      {...props}
      containerHeight={800} // Larger container for admin
      showAdminFeatures={true}
      showContactActions={true}
    />
  );
}

/**
 * Compact people list for smaller spaces or quick selection
 */
export function CompactVirtualPeopleList(props: VirtualPeopleListProps) {
  const renderCompactItem = (person: User, index: number, style: React.CSSProperties) => {
    const dogCount = props.onViewPerson ? 
      useDogStore.getState().dogs.filter(dog => dog.ownerId === person.id).length : 0;
    
    return (
      <div 
        style={style} 
        className="flex items-center justify-between px-3 py-2 border-b hover:bg-muted/50"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">
                {person.firstName} {person.lastName}
              </span>
              {dogCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {dogCount} dog{dogCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {person.email && (
              <div className="text-xs text-muted-foreground truncate">
                {person.email}
              </div>
            )}
          </div>
        </div>
        
        <Button variant="ghost" size="sm" onClick={() => props.onViewPerson?.(person)}>
          <Eye className="h-4 w-4" />
        </Button>
      </div>
    );
  };

  return (
    <VirtualScrollList
      items={useUserStore(state => state.people)}
      itemHeight={60} // Smaller height for compact view
      containerHeight={props.containerHeight || 400}
      renderItem={renderCompactItem}
      getItemKey={(person) => person.id}
      title="Users"
      icon={Users}
      searchPlaceholder="Search people..."
      emptyMessage="No people found"
      overscan={12} // More overscan for smaller items
    />
  );
}

/**
 * Exhibitor-focused virtual list showing only people with dogs
 */
export function VirtualExhibitorsList(props: VirtualPeopleListProps) {
  const people = useUserStore(state => state.people);
  const dogs = useDogStore(state => state.dogs);

  const dogOwnerIds = React.useMemo(() => {
    return new Set(dogs.map(dog => dog.ownerId).filter(Boolean));
  }, [dogs]);

  const exhibitors = React.useMemo(() => {
    return people.filter(person => dogOwnerIds.has(person.id));
  }, [people, dogOwnerIds]);

  const renderExhibitorItem = (person: User, _index: number, style: React.CSSProperties) => {
    const personDogs = dogs.filter(dog => dog.ownerId === person.id);

    return (
      <div
        style={style}
        className="flex items-center justify-between px-4 py-3 border-b hover:bg-muted/50"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-medium truncate">
                {person.firstName} {person.lastName}
              </h3>
              <Badge className="text-xs bg-blue-100 text-blue-800">
                {personDogs.length} dog{personDogs.length !== 1 ? 's' : ''}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {person.email && (
                <div className="flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  <span className="truncate max-w-48">{person.email}</span>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  <span>{person.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={() => props.onViewPerson?.(person)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => props.onEditPerson?.(person)}>
            <Edit className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <VirtualScrollList
      items={exhibitors}
      itemHeight={90}
      containerHeight={props.containerHeight || 600}
      renderItem={renderExhibitorItem}
      getItemKey={(person) => person.id}
      title="Exhibitors"
      icon={Users}
      searchPlaceholder="Search exhibitors by name, email, or phone..."
      emptyMessage="No exhibitors found"
      overscan={8}
    />
  );
}

/**
 * Get unique states from people list
 */
function getUniqueStates(people: User[]): string[] {
  const states = new Set(people.map(person => person.state).filter(Boolean));
  return Array.from(states).sort();
}