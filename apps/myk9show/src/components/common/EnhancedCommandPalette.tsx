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
  Clock,
  Loader2,
  TrendingUp,
  Filter
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { SearchResult } from '@/utils/searchIndex';

interface EnhancedCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type CategoryFilter = 'all' | 'dog' | 'person' | 'show' | 'club';

const CATEGORY_ICONS = {
  dog: <Dog className="h-4 w-4" />,
  person: <Users className="h-4 w-4" />,
  show: <Calendar className="h-4 w-4" />,
  club: <Building className="h-4 w-4" />
} as const;

const CATEGORY_LABELS = {
  all: 'All',
  dog: 'Dogs',
  person: 'Users', 
  show: 'Shows',
  club: 'Clubs'
} as const;

export function EnhancedCommandPalette({ open, onOpenChange }: EnhancedCommandPaletteProps) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const navigate = useNavigate();

  // Create stable handlers to prevent infinite re-renders
  const handleNavigateAndClose = useCallback((path: string) => {
    startTransition(() => {
      navigate(path);
      onOpenChange(false);
    });
  }, [navigate, onOpenChange]);

  // Recent searches hook
  const { addSearch, recentSearches: allRecentSearches } = useRecentSearches({ context: 'enhanced-command-palette' });
  
  // Global search with current category filter
  const searchOptions = useMemo(() => ({
    maxResults: 50,
    categories: categoryFilter === 'all' ? [] : [categoryFilter],
    debounceMs: 250
  }), [categoryFilter]);

  const {
    query,
    setQuery,
    results,
    isSearching,
    isIndexReady,
    suggestions,
    stats,
    clearSearch
  } = useGlobalSearch(searchOptions);

  // Recent searches for empty query (get first 5)
  const recentSearches = useMemo(() => 
    allRecentSearches.slice(0, 5).map(search => search.query),
    [allRecentSearches]
  );

  // Clear search when dialog closes
  useEffect(() => {
    if (!open) {
      clearSearch();
      setCategoryFilter('all');
    }
  }, [open, clearSearch]);

  // Navigation commands
  const navigationCommands = useMemo(() => [
    {
      id: 'nav-dogs',
      title: 'Dogs',
      subtitle: 'View all dogs',
      icon: <Dog className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/dogs'),
      keywords: ['dogs', 'pets', 'animals'],
    },
    {
      id: 'nav-people',
      title: 'Users',
      subtitle: 'View all people',
      icon: <Users className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/people'),
      keywords: ['people', 'contacts', 'owners'],
    },
    {
      id: 'nav-shows',
      title: 'Shows',
      subtitle: 'View all shows',
      icon: <Calendar className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/shows'),
      keywords: ['shows', 'events', 'competitions'],
    },
    {
      id: 'nav-clubs',
      title: 'Clubs',
      subtitle: 'View all clubs',
      icon: <Building className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/clubs'),
      keywords: ['clubs', 'organizations'],
    },
  ], [handleNavigateAndClose]);

  // Quick action commands
  const actionCommands = useMemo(() => [
    {
      id: 'add-dog',
      title: 'Add New Dog',
      icon: <Plus className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/dogs?add=true'),
      keywords: ['add', 'new', 'create', 'dog'],
    },
    {
      id: 'add-person',
      title: 'Add New User',
      icon: <Plus className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/people?add=true'),
      keywords: ['add', 'new', 'create', 'person'],
    },
    {
      id: 'add-show',
      title: 'Add New Show',
      icon: <Plus className="h-4 w-4" />,
      action: () => handleNavigateAndClose('/shows?add=true'),
      keywords: ['add', 'new', 'create', 'show'],
    },
  ], [handleNavigateAndClose]);

  const handleSelect = useCallback((result: SearchResult) => {
    if (query.trim()) {
      addSearch(query);
    }
    navigate(result.route);
    onOpenChange(false);
  }, [addSearch, query, navigate, onOpenChange]);

  const handleRecentSearchSelect = useCallback((searchTerm: string) => {
    setQuery(searchTerm);
  }, [setQuery]);

  const handleActionSelect = useCallback((action: () => void) => {
    if (query.trim()) {
      addSearch(query);
    }
    action();
  }, [query, addSearch]);

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    
    results.forEach(result => {
      const category = result.type;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(result);
    });
    
    return groups;
  }, [results]);

  const hasResults = results.length > 0;
  const showRecent = !query.trim() && recentSearches.length > 0;
  const showNavigation = !query.trim() || (!hasResults && !isSearching);
  const showActions = !query.trim() || query.startsWith('add') || query.startsWith('new') || query.startsWith('create');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0 bg-white/95 backdrop-blur-xl border border-gray-200 shadow-2xl rounded-2xl dark:bg-gray-900/95 dark:border-gray-700/50 dark:shadow-black/50">
        <Command shouldFilter={false} className="rounded-2xl border-0 bg-transparent">
          {/* Search Input */}
          <div className="flex items-center border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <Search className="mr-3 h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search dogs, people, shows..."
              className="flex h-8 w-full bg-transparent text-base outline-none placeholder:text-gray-400 disabled:cursor-not-allowed disabled:opacity-50 font-medium text-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
            />
            {isSearching && <Loader2 className="ml-3 h-5 w-5 animate-spin text-blue-500" />}
          </div>

          {/* Category Filters */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <Filter className="h-4 w-4 text-gray-500 mr-2 dark:text-gray-400" />
            {(Object.keys(CATEGORY_LABELS) as CategoryFilter[]).map(category => (
              <button
                key={category}
                onClick={() => setCategoryFilter(category)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${
                  categoryFilter === category
                    ? 'bg-blue-600 text-white shadow-sm scale-105'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200 hover:scale-105 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            ))}
            {isIndexReady && (
              <span className="ml-auto text-xs text-muted-foreground">
                {stats.totalItems} items indexed
              </span>
            )}
            {(!isIndexReady || stats.totalItems === 0) && (
              <button
                onClick={() => {
                  // Force clear localStorage and reload
                  const keys = [
                    'myk9show-dogs-storage',
                    'myk9show-user-storage', 
                    'myk9show-shows-storage'
                  ];
                  keys.forEach(key => localStorage.removeItem(key));
                  window.location.reload();
                }}
                className="ml-auto text-xs text-amber-600 hover:text-amber-700 underline"
              >
                Reset Data
              </button>
            )}
          </div>

          <Command.List className="max-h-[400px] overflow-y-auto p-3 bg-white dark:bg-gray-900">
            <Command.Empty className="py-12 text-center text-base text-gray-500 dark:text-gray-400">
              {!isIndexReady ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building search index...
                </div>
              ) : (
                'No results found.'
              )}
            </Command.Empty>

            {/* Recent Searches */}
            {showRecent && (
              <Command.Group heading="Recent Searches" className="px-2 pb-3">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3 dark:text-gray-400">Recent Searches</div>
                {recentSearches.map((searchTerm, index) => (
                  <Command.Item
                    key={`recent-${index}`}
                    value={searchTerm}
                    onSelect={() => handleRecentSearchSelect(searchTerm)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 dark:hover:bg-gray-700 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <Clock className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <span className="font-medium">{searchTerm}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Search Results by Category */}
            {hasResults && Object.entries(groupedResults).map(([category, categoryResults]) => (
              <Command.Group key={category} className="px-2 pb-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3 dark:text-gray-400">
                  {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]}
                </div>
                {categoryResults.map(result => (
                  <Command.Item
                    key={result.id}
                    value={`${result.title} ${result.subtitle || ''}`}
                    onSelect={() => handleSelect(result)}
                    className="flex items-center gap-4 px-3 py-3 text-sm rounded-lg cursor-pointer hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 group dark:hover:bg-gray-700 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <div className="flex-shrink-0 p-2 rounded-md bg-gray-100 group-hover:bg-blue-100 group-aria-selected:bg-blue-200 transition-colors duration-200 dark:bg-gray-700 dark:group-hover:bg-blue-900/30 dark:group-aria-selected:bg-blue-800/50">
                      {CATEGORY_ICONS[result.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-gray-900 group-aria-selected:text-blue-600 dark:text-gray-100 dark:group-aria-selected:text-blue-400">{result.title}</div>
                      {result.subtitle && (
                        <div className="text-sm text-gray-500 truncate mt-0.5 dark:text-gray-400">
                          {result.subtitle}
                        </div>
                      )}
                    </div>
                    {result.score > 0.8 && (
                      <Badge variant="secondary" className="text-xs bg-success-green/10 text-success-green border-success-green/20 px-2 py-1">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        Best Match
                      </Badge>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {/* Navigation Commands */}
            {showNavigation && (
              <Command.Group className="px-2 pb-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3 dark:text-gray-400">
                  Navigation
                </div>
                {navigationCommands.map(command => (
                  <Command.Item
                    key={command.id}
                    value={`${command.title} ${command.subtitle} ${command.keywords.join(' ')}`}
                    onSelect={() => handleActionSelect(command.action)}
                    className="flex items-center gap-4 px-3 py-3 text-sm rounded-lg cursor-pointer hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 group dark:hover:bg-gray-700 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <div className="flex-shrink-0 p-2 rounded-md bg-gray-100 group-hover:bg-blue-100 group-aria-selected:bg-blue-200 transition-colors duration-200 dark:bg-gray-700 dark:group-hover:bg-blue-900/30 dark:group-aria-selected:bg-blue-800/50">
                      {command.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900 group-aria-selected:text-blue-600 dark:text-gray-100 dark:group-aria-selected:text-blue-400">{command.title}</div>
                      <div className="text-sm text-gray-500 mt-0.5 dark:text-gray-400">{command.subtitle}</div>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Actions */}
            {showActions && (
              <Command.Group className="px-2 pb-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-3 dark:text-gray-400">
                  Quick Actions
                </div>
                {actionCommands.map(command => (
                  <Command.Item
                    key={command.id}
                    value={`${command.title} ${command.keywords.join(' ')}`}
                    onSelect={() => handleActionSelect(command.action)}
                    className="flex items-center gap-4 px-3 py-3 text-sm rounded-lg cursor-pointer hover:bg-gray-100 aria-selected:bg-blue-50 aria-selected:text-blue-600 transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 group dark:hover:bg-gray-700 dark:aria-selected:bg-blue-900/30 dark:aria-selected:text-blue-400"
                  >
                    <div className="flex-shrink-0 p-2 rounded-md bg-gray-100 group-hover:bg-green-100 group-aria-selected:bg-green-200 transition-colors duration-200 dark:bg-gray-700 dark:group-hover:bg-green-900/30 dark:group-aria-selected:bg-green-800/50">
                      {command.icon}
                    </div>
                    <div className="font-semibold text-foreground group-aria-selected:text-primary">{command.title}</div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          {/* Footer with search tips */}
          {query.length > 0 && suggestions.length > 0 && (
            <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 dark:text-gray-400">Suggestions:</div>
              <div className="flex flex-wrap gap-2">
                {suggestions.slice(0, 3).map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => setQuery(suggestion)}
                    className="px-3 py-1.5 text-xs font-medium bg-gray-200 hover:bg-blue-100 hover:text-blue-600 rounded-full transition-all duration-200 hover:scale-105 border border-gray-300 dark:bg-gray-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 dark:border-gray-600"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          {/* Keyboard shortcuts footer */}
          <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-xs font-mono dark:bg-gray-700 dark:border-gray-600">↑↓</kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-xs font-mono dark:bg-gray-700 dark:border-gray-600">⏎</kbd>
                  <span>Select</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-200 border border-gray-300 rounded text-xs font-mono dark:bg-gray-700 dark:border-gray-600">⌘K</kbd>
                  <span>Close</span>
                </div>
              </div>
              {isIndexReady && (
                <div className="text-xs text-gray-400 dark:text-gray-500">
                  {stats.totalItems} items • {results.length} results
                </div>
              )}
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}