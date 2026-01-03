import React, { useState, useEffect, useMemo, useCallback, startTransition } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Dog, 
  Users, 
  Calendar, 
  Building, 
  Plus,
  Filter,
  X,
  Clock,
  Settings,
  FileText,
  MapPin
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useRegistrationPermissions } from '@/hooks/useRegistrationPermissions';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDateMMDDYYYY } from '@/components/common/formatDate';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CommandAction = {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords?: string[];
  category: 'navigation' | 'data' | 'actions' | 'recent';
  type?: 'dog' | 'person' | 'show' | 'club' | 'trial' | 'class' | 'registration';
  metadata?: Record<string, unknown>;
  priority?: number; // Higher priority = shown first
};

type SearchFilter = {
  category?: string;
  type?: string;
  showRecent?: boolean;
};

const FACET_CATEGORIES = [
  { id: 'all', label: 'All', icon: <Search className="h-3 w-3" /> },
  { id: 'navigation', label: 'Navigate', icon: <MapPin className="h-3 w-3" /> },
  { id: 'data', label: 'Search', icon: <FileText className="h-3 w-3" /> },
  { id: 'actions', label: 'Actions', icon: <Plus className="h-3 w-3" /> },
  { id: 'recent', label: 'Recent', icon: <Clock className="h-3 w-3" /> },
];

const FACET_TYPES = [
  { id: 'all', label: 'All Types', icon: <Search className="h-3 w-3" /> },
  { id: 'dog', label: 'Dogs', icon: <Dog className="h-3 w-3" /> },
  { id: 'person', label: 'Users', icon: <Users className="h-3 w-3" /> },
  { id: 'show', label: 'Shows', icon: <Calendar className="h-3 w-3" /> },
  { id: 'club', label: 'Clubs', icon: <Building className="h-3 w-3" /> },
];

export function CommandPaletteEnhanced({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<SearchFilter>({});
  const [showFacets, setShowFacets] = useState(false);
  const navigate = useNavigate();

  // Debounced search for performance
  const debouncedSearch = useDebounce(search, 200);

  // Get data from stores
  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  const shows = useShowStore(state => state.shows);
  
  // Get user permissions
  const { canViewAllDogs, canCreateExhibitor, isSecretary, isSiteAdmin } = useRegistrationPermissions();

  // Memoized navigation and close handler to prevent infinite re-renders
  const handleNavigateAndClose = useCallback((path: string) => {
    startTransition(() => {
      navigate(path);
      onOpenChange(false);
    });
  }, [navigate, onOpenChange]);

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setActiveFilters({});
      setShowFacets(false);
    }
  }, [open]);

  // Navigation commands with RBAC
  const navigationCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [
      {
        id: 'nav-dogs',
        title: 'Dogs',
        subtitle: 'View all dogs',
        icon: <Dog className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/dogs'),
        keywords: ['dogs', 'pets', 'animals', 'breeds'],
        category: 'navigation',
        type: 'dog',
        priority: 10
      },
      {
        id: 'nav-people',
        title: 'Users',
        subtitle: 'View all people',
        icon: <Users className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/people'),
        keywords: ['people', 'contacts', 'owners', 'exhibitors'],
        category: 'navigation',
        type: 'person',
        priority: 9
      },
      {
        id: 'nav-shows',
        title: 'Shows',
        subtitle: 'View all shows',
        icon: <Calendar className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/shows'),
        keywords: ['shows', 'events', 'competitions', 'trials'],
        category: 'navigation',
        type: 'show',
        priority: 8
      },
      {
        id: 'nav-clubs',
        title: 'Clubs',
        subtitle: 'View all clubs',
        icon: <Building className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/clubs'),
        keywords: ['clubs', 'organizations'],
        category: 'navigation',
        type: 'club',
        priority: 7
      }
    ];

    // Add admin-only navigation
    if (isSiteAdmin) {
      commands.push({
        id: 'nav-admin',
        title: 'Administration',
        subtitle: 'System administration',
        icon: <Settings className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/admin'),
        keywords: ['admin', 'administration', 'settings', 'system'],
        category: 'navigation',
        priority: 5
      });
    }

    return commands;
  }, [handleNavigateAndClose, isSiteAdmin]);

  // Data-specific commands with enhanced search
  const dataCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [];
    const searchTerm = debouncedSearch.toLowerCase();

    // Get accessible dogs based on RBAC
    const accessibleDogs = canViewAllDogs ? dogs : dogs.filter(() => 
      // Add your own dog filtering logic here based on ownership
      true // Placeholder - should filter by user's dogs
    );

    // Add dogs with enhanced metadata
    accessibleDogs
      .filter(dog => !dog.deletedAt)
      .slice(0, 10)
      .forEach(dog => {
        const dogKeywords = [
          dog.name,
          dog.callName,
          dog.registrations?.[0]?.breed || "No breed specified",
          dog.microchip,
          ...(dog.registrations?.map(reg => [reg.registeredName, reg.registrationNumber, reg.organization]).flat() || [])
        ].filter(Boolean) as string[];

        // Enhanced matching for better search results
        const matchesSearch = !searchTerm || dogKeywords.some(keyword => 
          keyword?.toLowerCase().includes(searchTerm)
        );

        if (matchesSearch) {
          commands.push({
            id: `dog-${dog.id}`,
            title: dog.callName || dog.name,
            subtitle: `${dog.registrations?.[0]?.breed || 'No breed specified'} • ${dog.gender || 'Unknown'} • Born ${dog.dateOfBirth ? formatDateMMDDYYYY(dog.dateOfBirth) : 'Unknown'}`,
            icon: <Dog className="h-4 w-4" />,
            action: () => handleNavigateAndClose(`/dogs/${dog.id}`),
            keywords: dogKeywords,
            category: 'data',
            type: 'dog',
            metadata: {
              breed: dog.registrations?.[0]?.breed || "No breed specified",
              gender: dog.gender,
              age: dog.dateOfBirth,
              registrations: dog.registrations?.length || 0
            },
            priority: searchTerm ? (dogKeywords.findIndex(k => k?.toLowerCase().startsWith(searchTerm)) !== -1 ? 10 : 5) : 3
          });
        }
      });

    // Add people with enhanced search
    people
      .slice(0, 10)
      .forEach(person => {
        const name = `${person.firstName} ${person.lastName}`;
        const personKeywords = [
          person.firstName,
          person.lastName,
          name,
          person.email,
          person.phone
        ].filter(Boolean) as string[];

        const matchesSearch = !searchTerm || personKeywords.some(keyword => 
          keyword?.toLowerCase().includes(searchTerm)
        );

        if (matchesSearch) {
          commands.push({
            id: `person-${person.id}`,
            title: name,
            subtitle: `${person.email || person.phone || 'Contact'} • View profile`,
            icon: <Users className="h-4 w-4" />,
            action: () => handleNavigateAndClose(`/people/${person.id}`),
            keywords: personKeywords,
            category: 'data',
            type: 'person',
            metadata: {
              email: person.email,
              phone: person.phone,
              dogsCount: person.dogs?.length || 0
            },
            priority: searchTerm ? (personKeywords.findIndex(k => k?.toLowerCase().startsWith(searchTerm)) !== -1 ? 10 : 5) : 3
          });
        }
      });

    // Add shows with location and date info
    shows
      .slice(0, 10)
      .forEach(show => {
        const showKeywords = [
          show.name,
          show.location,
          show.type,
          show.clubName
        ].filter(Boolean) as string[];

        const matchesSearch = !searchTerm || showKeywords.some(keyword => 
          keyword?.toLowerCase().includes(searchTerm)
        );

        if (matchesSearch) {
          commands.push({
            id: `show-${show.id}`,
            title: show.name,
            subtitle: `${show.location} • ${formatDateMMDDYYYY(show.startDate)} • ${show.type}`,
            icon: <Calendar className="h-4 w-4" />,
            action: () => handleNavigateAndClose(`/shows/${show.id}`),
            keywords: showKeywords,
            category: 'data',
            type: 'show',
            metadata: {
              location: show.location,
              date: show.startDate,
              type: show.type,
              status: show.status
            },
            priority: searchTerm ? (showKeywords.findIndex(k => k?.toLowerCase().startsWith(searchTerm)) !== -1 ? 10 : 5) : 3
          });
        }
      });

    return commands.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [dogs, people, shows, handleNavigateAndClose, canViewAllDogs, debouncedSearch]);

  // Quick action commands with RBAC
  const actionCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [
      {
        id: 'add-dog',
        title: 'Add New Dog',
        subtitle: 'Create a new dog profile',
        icon: <Plus className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/dogs?add=true'),
        keywords: ['add', 'new', 'create', 'dog', 'register'],
        category: 'actions',
        type: 'dog',
        priority: 8
      }
    ];

    // Add people creation for secretaries and above
    if (canCreateExhibitor) {
      commands.push({
        id: 'add-person',
        title: 'Add New User',
        subtitle: 'Create a new person profile',
        icon: <Plus className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/people?add=true'),
        keywords: ['add', 'new', 'create', 'person', 'contact', 'exhibitor'],
        category: 'actions',
        type: 'person',
        priority: 7
      });
    }

    // Add show creation for secretaries and above
    if (isSecretary) {
      commands.push({
        id: 'add-show',
        title: 'Add New Show',
        subtitle: 'Create a new show event',
        icon: <Plus className="h-4 w-4" />,
        action: () => handleNavigateAndClose('/shows?add=true'),
        keywords: ['add', 'new', 'create', 'show', 'event', 'competition'],
        category: 'actions',
        type: 'show',
        priority: 6
      });
    }

    return commands;
  }, [handleNavigateAndClose, canCreateExhibitor, isSecretary]);

  // Combine and filter commands
  const allCommands = useMemo(() => {
    let commands = [...navigationCommands, ...dataCommands, ...actionCommands];

    // Apply category filter
    if (activeFilters.category && activeFilters.category !== 'all') {
      commands = commands.filter(cmd => cmd.category === activeFilters.category);
    }

    // Apply type filter
    if (activeFilters.type && activeFilters.type !== 'all') {
      commands = commands.filter(cmd => cmd.type === activeFilters.type);
    }

    return commands.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [navigationCommands, dataCommands, actionCommands, activeFilters]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    
    allCommands.forEach(command => {
      if (!groups[command.category]) {
        groups[command.category] = [];
      }
      groups[command.category].push(command);
    });

    return groups;
  }, [allCommands]);

  const handleSelect = (commandId: string) => {
    const command = allCommands.find(cmd => cmd.id === commandId);
    command?.action();
  };

  const toggleFilter = (filterType: 'category' | 'type', value: string) => {
    setActiveFilters(prev => ({
      ...prev,
      [filterType]: prev[filterType] === value ? undefined : value
    }));
  };

  const clearAllFilters = () => {
    setActiveFilters({});
  };

  const hasActiveFilters = Object.values(activeFilters).some(v => v && v !== 'all');

  const getGroupTitle = (category: string) => {
    switch (category) {
      case 'navigation': return 'Navigate';
      case 'data': return 'Search Results';
      case 'actions': return 'Quick Actions';
      case 'recent': return 'Recent';
      default: return category;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <Command className="rounded-lg border-none shadow-none bg-white dark:bg-gray-900">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search dogs, people, shows, or type a command..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-white dark:bg-gray-900 py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
            />
            <button
              onClick={() => setShowFacets(!showFacets)}
              className="ml-2 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Show filters"
            >
              <Filter className="h-4 w-4 opacity-50" />
            </button>
          </div>

          {/* Faceted Filters */}
          {showFacets && (
            <div className="border-b border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
              <div className="space-y-3">
                {/* Category Filters */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Category</div>
                  <div className="flex flex-wrap gap-1">
                    {FACET_CATEGORIES.map(facet => (
                      <button
                        key={facet.id}
                        onClick={() => toggleFilter('category', facet.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          activeFilters.category === facet.id
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                            : 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {facet.icon}
                        {facet.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Type Filters */}
                <div>
                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Type</div>
                  <div className="flex flex-wrap gap-1">
                    {FACET_TYPES.map(facet => (
                      <button
                        key={facet.id}
                        onClick={() => toggleFilter('type', facet.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                          activeFilters.type === facet.id
                            ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                            : 'bg-white hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {facet.icon}
                        {facet.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {Object.values(activeFilters).filter(v => v && v !== 'all').length} filter(s) active
                    </div>
                    <button
                      onClick={clearAllFilters}
                      className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                    >
                      <X className="h-3 w-3" />
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Command List */}
          <Command.List className="max-h-96 overflow-y-auto p-2 bg-white dark:bg-gray-900">
            <Command.Empty className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No results found. Try adjusting your search or filters.
            </Command.Empty>

            {/* Grouped Commands */}
            {Object.entries(groupedCommands).map(([category, commands]) => (
              commands.length > 0 && (
                <Command.Group 
                  key={category}
                  heading={getGroupTitle(category)} 
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400"
                >
                  {commands.map((command) => (
                    <Command.Item
                      key={command.id}
                      value={`${command.title} ${command.subtitle} ${command.keywords?.join(' ')}`}
                      onSelect={() => handleSelect(command.id)}
                      className="flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <div className={`mr-3 flex h-8 w-8 items-center justify-center rounded-md ${
                        command.category === 'actions' 
                          ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                      }`}>
                        {command.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {command.title}
                        </div>
                        {command.subtitle && (
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {command.subtitle}
                          </div>
                        )}
                      </div>
                      {command.type && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {command.type}
                        </Badge>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// Hook moved to separate file to avoid Fast Refresh issues