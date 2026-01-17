import React, { useState, useMemo, startTransition } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  Search, 
  Dog, 
  Users, 
  Calendar, 
  Building, 
  Plus,
  Clock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useRecentSearches } from '@/hooks/useRecentSearches';

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
  category: 'navigation' | 'data' | 'actions';
};

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  // Recent searches hook
  const { addSearch, getSuggestions } = useRecentSearches({ context: 'command-palette' });

  // Get data from stores
  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  const shows = useShowStore(state => state.shows);
  // const clubs = useClubStore(state => state.clubs);

  // Track open state to clear search when dialog closes
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setSearch('');
    }
  }

  // Navigation commands
  const navigationCommands: CommandAction[] = [
    {
      id: 'nav-dogs',
      title: 'Dogs',
      subtitle: 'View all dogs',
      icon: <Dog className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/dogs'); onOpenChange(false); }); },
      keywords: ['dogs', 'pets', 'animals'],
      category: 'navigation',
    },
    {
      id: 'nav-people',
      title: 'Users',
      subtitle: 'View all people',
      icon: <Users className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/people'); onOpenChange(false); }); },
      keywords: ['people', 'contacts', 'owners'],
      category: 'navigation',
    },
    {
      id: 'nav-shows',
      title: 'Shows',
      subtitle: 'View all shows',
      icon: <Calendar className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/shows'); onOpenChange(false); }); },
      keywords: ['shows', 'events', 'competitions'],
      category: 'navigation',
    },
    {
      id: 'nav-clubs',
      title: 'Clubs',
      subtitle: 'View all clubs',
      icon: <Building className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/clubs'); onOpenChange(false); }); },
      keywords: ['clubs', 'organizations'],
      category: 'navigation',
    },
  ];

  // Data-specific commands (dynamic based on current data)
  const dataCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [];

    // Add dogs
    dogs.slice(0, 5).forEach(dog => {
      commands.push({
        id: `dog-${dog.id}`,
        title: dog.callName || dog.name,
        subtitle: `${dog.registrations?.[0]?.breed || 'No breed specified'} • Go to dog profile`,
        icon: <Dog className="h-4 w-4" />,
        action: () => { startTransition(() => { navigate(`/dogs/${dog.id}`); onOpenChange(false); }); },
        keywords: [dog.name, dog.callName, dog.registrations?.[0]?.breed || ''].filter(Boolean) as string[],
        category: 'data',
      });
    });

    // Add people
    people.slice(0, 5).forEach(person => {
      const name = `${person.firstName} ${person.lastName}`;
      commands.push({
        id: `person-${person.id}`,
        title: name,
        subtitle: 'Go to person profile',
        icon: <Users className="h-4 w-4" />,
        action: () => { startTransition(() => { navigate(`/people/${person.id}`); onOpenChange(false); }); },
        keywords: [person.firstName, person.lastName, name],
        category: 'data',
      });
    });

    // Add shows
    shows.slice(0, 5).forEach(show => {
      commands.push({
        id: `show-${show.id}`,
        title: show.name,
        subtitle: `${show.location} • Go to show`,
        icon: <Calendar className="h-4 w-4" />,
        action: () => { startTransition(() => { navigate(`/shows/${show.id}`); onOpenChange(false); }); },
        keywords: [show.name, show.location, show.type],
        category: 'data',
      });
    });

    return commands;
  }, [dogs, people, shows, navigate, onOpenChange]);

  // Quick action commands
  const actionCommands: CommandAction[] = [
    {
      id: 'add-dog',
      title: 'Add New Dog',
      icon: <Plus className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/dogs?add=true'); onOpenChange(false); }); },
      keywords: ['add', 'new', 'create', 'dog'],
      category: 'actions',
    },
    {
      id: 'add-person',
      title: 'Add New User',
      icon: <Plus className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/people?add=true'); onOpenChange(false); }); },
      keywords: ['add', 'new', 'create', 'person', 'contact'],
      category: 'actions',
    },
    {
      id: 'add-show',
      title: 'Add New Show',
      icon: <Plus className="h-4 w-4" />,
      action: () => { startTransition(() => { navigate('/?wizard=true'); onOpenChange(false); }); },
      keywords: ['add', 'new', 'create', 'show', 'event'],
      category: 'actions',
    },
  ];

  const allCommands = [...navigationCommands, ...dataCommands, ...actionCommands];

  const handleSelect = (commandId: string) => {
    const command = allCommands.find(cmd => cmd.id === commandId);
    if (command) {
      // Add to recent searches if there was a search query
      if (search.trim()) {
        addSearch(search.trim(), {
          resultCount: 1,
          filters: { selectedCommand: command.title }
        });
      }
      command.action();
    }
  };

  // Get recent search suggestions for empty query
  const recentSuggestions = search.trim() ? [] : getSuggestions('', 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
        <Command className="rounded-lg border-none shadow-none bg-white dark:bg-gray-900">
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search dogs, people, shows, or type a command..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-white dark:bg-gray-900 py-3 text-sm outline-none placeholder:text-gray-500 disabled:cursor-not-allowed disabled:opacity-50 dark:placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
            />
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2 bg-white dark:bg-gray-900">
            <Command.Empty className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No results found.
            </Command.Empty>

            {/* Recent Searches Group (shown when no search query) */}
            {!search.trim() && recentSuggestions.length > 0 && (
              <Command.Group heading="Recent Searches" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400">
                {recentSuggestions.map((recent) => (
                  <Command.Item
                    key={recent.id}
                    value={recent.query}
                    onSelect={() => {
                      setSearch(recent.query);
                    }}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <Clock className="h-4 w-4 text-gray-500" />
                    <div className="flex-1">
                      <div>{recent.query}</div>
                      {recent.metadata?.selectedCommand && (
                        <div className="text-xs text-gray-500">
                          → {recent.metadata.selectedCommand}
                        </div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation Group */}
            <Command.Group heading="Navigation" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400">
              {navigationCommands.map((command) => (
                <Command.Item
                  key={command.id}
                  value={`${command.title} ${command.subtitle} ${command.keywords?.join(' ')}`}
                  onSelect={() => handleSelect(command.id)}
                  className="flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                    {command.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{command.title}</div>
                    {command.subtitle && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {command.subtitle}
                      </div>
                    )}
                  </div>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Recent Data Group */}
            {dataCommands.length > 0 && (
              <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400">
                {dataCommands.map((command) => (
                  <Command.Item
                    key={command.id}
                    value={`${command.title} ${command.subtitle} ${command.keywords?.join(' ')}`}
                    onSelect={() => handleSelect(command.id)}
                    className="flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                      {command.icon}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{command.title}</div>
                      {command.subtitle && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {command.subtitle}
                        </div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions Group */}
            <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-gray-500 dark:[&_[cmdk-group-heading]]:text-gray-400">
              {actionCommands.map((command) => (
                <Command.Item
                  key={command.id}
                  value={`${command.title} ${command.keywords?.join(' ')}`}
                  onSelect={() => handleSelect(command.id)}
                  className="flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 aria-selected:bg-gray-100 dark:aria-selected:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                    {command.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{command.title}</div>
                  </div>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// Hook moved to separate file to avoid Fast Refresh issues