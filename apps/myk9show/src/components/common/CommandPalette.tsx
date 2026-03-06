import React, { useState, useMemo, startTransition } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, Dog, Users, Calendar, Building, Plus, Clock } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { useNavigate } from 'react-router-dom';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { getDogDisplayName } from '@/types/dog-types';

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
  shortcut?: string;
};

const MAX_DATA_RESULTS = 5;

const groupHeadingClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

const itemClass =
  'flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-muted aria-selected:bg-muted text-foreground';

function ShortcutBadge({ keys }: { keys: string }) {
  return (
    <div className="flex items-center gap-0.5 ml-auto">
      {keys.split(' ').map((key, i) => (
        <Kbd key={i}>{key}</Kbd>
      ))}
    </div>
  );
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const { addSearch, getSuggestions } = useRecentSearches({ context: 'command-palette' });

  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  const shows = useShowStore(state => state.shows);

  // Clear search when dialog closes
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setSearch('');
    }
  }

  const navigationCommands: CommandAction[] = useMemo(
    () => [
      {
        id: 'nav-dogs',
        title: 'Dogs',
        subtitle: 'View all dogs',
        icon: <Dog className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/dogs');
            onOpenChange(false);
          }),
        keywords: ['dogs', 'pets', 'animals'],
        category: 'navigation' as const,
        shortcut: 'G D',
      },
      {
        id: 'nav-people',
        title: 'Users',
        subtitle: 'View all people',
        icon: <Users className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/people');
            onOpenChange(false);
          }),
        keywords: ['people', 'contacts', 'owners'],
        category: 'navigation' as const,
        shortcut: 'G P',
      },
      {
        id: 'nav-shows',
        title: 'Shows',
        subtitle: 'View all shows',
        icon: <Calendar className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/shows');
            onOpenChange(false);
          }),
        keywords: ['shows', 'events', 'competitions'],
        category: 'navigation' as const,
        shortcut: 'G S',
      },
      {
        id: 'nav-clubs',
        title: 'Clubs',
        subtitle: 'View all clubs',
        icon: <Building className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/clubs');
            onOpenChange(false);
          }),
        keywords: ['clubs', 'organizations'],
        category: 'navigation' as const,
        shortcut: 'G C',
      },
    ],
    [navigate, onOpenChange]
  );

  // Build all data commands from full dataset, then let cmdk filter + we slice display
  const allDataCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [];

    for (const dog of dogs) {
      commands.push({
        id: `dog-${dog.id}`,
        title: getDogDisplayName(dog),
        subtitle: `${dog.registrations?.[0]?.breed || 'No breed specified'} · Go to dog profile`,
        icon: <Dog className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/dogs/${dog.id}`);
            onOpenChange(false);
          }),
        keywords: [dog.name, dog.callName, dog.registrations?.[0]?.breed || ''].filter(
          Boolean
        ) as string[],
        category: 'data',
      });
    }

    for (const person of people) {
      const name = `${person.firstName} ${person.lastName}`;
      commands.push({
        id: `person-${person.id}`,
        title: name,
        subtitle: 'Go to person profile',
        icon: <Users className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/people/${person.id}`);
            onOpenChange(false);
          }),
        keywords: [person.firstName, person.lastName, name],
        category: 'data',
      });
    }

    for (const show of shows) {
      commands.push({
        id: `show-${show.id}`,
        title: show.name,
        subtitle: `${show.location} · Go to show`,
        icon: <Calendar className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/shows/${show.id}`);
            onOpenChange(false);
          }),
        keywords: [show.name, show.location, show.organization],
        category: 'data',
      });
    }

    return commands;
  }, [dogs, people, shows, navigate, onOpenChange]);

  // When searching, filter data commands client-side and take top results.
  // cmdk also filters, but we limit the rendered count for performance.
  const dataCommands = useMemo(() => {
    if (!search.trim()) return allDataCommands.slice(0, MAX_DATA_RESULTS);

    const term = search.toLowerCase();
    const scored = allDataCommands
      .map(cmd => {
        const haystack = [cmd.title, cmd.subtitle, ...(cmd.keywords || [])].join(' ').toLowerCase();
        if (!haystack.includes(term)) return null;
        // Prefer title matches over keyword/subtitle matches
        const score = cmd.title.toLowerCase().includes(term) ? 2 : 1;
        return { cmd, score };
      })
      .filter(Boolean) as Array<{ cmd: CommandAction; score: number }>;

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_DATA_RESULTS).map(s => s.cmd);
  }, [allDataCommands, search]);

  const actionCommands: CommandAction[] = useMemo(
    () => [
      {
        id: 'add-dog',
        title: 'Add New Dog',
        icon: <Plus className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/dogs?add=true');
            onOpenChange(false);
          }),
        keywords: ['add', 'new', 'create', 'dog'],
        category: 'actions' as const,
        shortcut: 'C D',
      },
      {
        id: 'add-person',
        title: 'Add New User',
        icon: <Plus className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/people?add=true');
            onOpenChange(false);
          }),
        keywords: ['add', 'new', 'create', 'person', 'contact'],
        category: 'actions' as const,
        shortcut: 'C P',
      },
      {
        id: 'add-show',
        title: 'Add New Show',
        icon: <Plus className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/?wizard=true');
            onOpenChange(false);
          }),
        keywords: ['add', 'new', 'create', 'show', 'event'],
        category: 'actions' as const,
        shortcut: 'C S',
      },
    ],
    [navigate, onOpenChange]
  );

  const allCommands = useMemo(
    () => [...navigationCommands, ...dataCommands, ...actionCommands],
    [navigationCommands, dataCommands, actionCommands]
  );

  const handleSelect = (commandId: string) => {
    const command = allCommands.find(cmd => cmd.id === commandId);
    if (command) {
      if (search.trim()) {
        addSearch(search.trim(), {
          resultCount: 1,
          filters: { selectedCommand: command.title },
        });
      }
      command.action();
    }
  };

  const recentSuggestions = search.trim() ? [] : getSuggestions('', 3);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 bg-background border border-border">
        <Command className="rounded-lg border-none shadow-none bg-background">
          <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Command.Input
              placeholder="Search dogs, people, shows, or type a command..."
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-background py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
            />
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2 bg-background">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {/* Recent Searches */}
            {!search.trim() && recentSuggestions.length > 0 && (
              <Command.Group heading="Recent Searches" className={groupHeadingClass}>
                {recentSuggestions.map(recent => (
                  <Command.Item
                    key={recent.id}
                    value={recent.query}
                    onSelect={() => setSearch(recent.query)}
                    className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer rounded-md hover:bg-muted text-foreground"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div>{recent.query}</div>
                      {recent.metadata?.selectedCommand && (
                        <div className="text-xs text-muted-foreground">
                          → {recent.metadata.selectedCommand}
                        </div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation */}
            <Command.Group heading="Navigation" className={groupHeadingClass}>
              {navigationCommands.map(command => (
                <Command.Item
                  key={command.id}
                  value={`${command.title} ${command.subtitle} ${command.keywords?.join(' ')}`}
                  onSelect={() => handleSelect(command.id)}
                  className={itemClass}
                >
                  <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {command.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{command.title}</div>
                    {command.subtitle && (
                      <div className="text-xs text-muted-foreground">{command.subtitle}</div>
                    )}
                  </div>
                  {command.shortcut && <ShortcutBadge keys={command.shortcut} />}
                </Command.Item>
              ))}
            </Command.Group>

            {/* Go to (data) */}
            {dataCommands.length > 0 && (
              <Command.Group heading="Go to" className={groupHeadingClass}>
                {dataCommands.map(command => (
                  <Command.Item
                    key={command.id}
                    value={`${command.title} ${command.subtitle} ${command.keywords?.join(' ')}`}
                    onSelect={() => handleSelect(command.id)}
                    className={itemClass}
                  >
                    <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {command.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-foreground">{command.title}</div>
                      {command.subtitle && (
                        <div className="text-xs text-muted-foreground">{command.subtitle}</div>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Actions */}
            <Command.Group heading="Actions" className={groupHeadingClass}>
              {actionCommands.map(command => (
                <Command.Item
                  key={command.id}
                  value={`${command.title} ${command.keywords?.join(' ')}`}
                  onSelect={() => handleSelect(command.id)}
                  className={itemClass}
                >
                  <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {command.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-foreground">{command.title}</div>
                  </div>
                  {command.shortcut && <ShortcutBadge keys={command.shortcut} />}
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          {/* Footer with keyboard hints */}
          <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd size="sm">↑↓</Kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="sm">↵</Kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <Kbd size="sm">esc</Kbd>
              Close
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd size="sm">?</Kbd>
              All shortcuts
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
