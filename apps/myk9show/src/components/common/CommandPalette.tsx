import { useState, useMemo, startTransition } from 'react';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search, Dog, Users, Calendar, Building, Plus, Clock, ArrowRight } from 'lucide-react';
import { Kbd } from '@/components/ui/kbd';
import { useNavigate } from 'react-router-dom';
import { useDogStore } from '@/store/dogStore';
import { useUserStore } from '@/store/userStore';
import { useShowStore } from '@/store/showStore';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useRecentSearches } from '@/hooks/useRecentSearches';
import { getDogBreedLabel, getDogDisplayName } from '@/types/dog-types';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import { useCommandMenuCommands } from '@/features/command-menu/useCommandMenuCommands';
import { adaptCommandMenuCommand, type CommandAction } from '@/features/command-menu/commandPaletteAdapter';
import { getShortcutKeysForCommand } from '@/components/layout/appShortcuts';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the keyboard-shortcuts overlay. When provided, the footer renders
   * an "All shortcuts" button (pointer-primary — the `?` shortcut is
   * suppressed while the palette's input is focused, so a button is the
   * honest affordance here). When absent, the footer segment is hidden. */
  onShowShortcuts?: () => void;
}

const MAX_DATA_RESULTS = 5;

const groupHeadingClass =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground';

const itemClass =
  'flex items-center px-2 py-2 text-sm rounded-sm cursor-pointer hover:bg-muted aria-selected:bg-muted text-foreground';

/** Spreadable `{ shortcut }` for a `CommandAction`, or `{}` when the
 * given command has no registered shortcut in `appShortcuts.ts` — kept as a
 * spread (rather than `shortcut: string | undefined`) because
 * `exactOptionalPropertyTypes` forbids assigning `undefined` to an optional
 * property. */
function shortcutProp(commandId: string): { shortcut: string } | Record<string, never> {
  const keys = getShortcutKeysForCommand(commandId);
  return keys ? { shortcut: keys } : {};
}

function ShortcutBadge({ keys }: { keys: string }) {
  return (
    <div className="flex items-center gap-0.5 ml-auto">
      {keys.split(' ').map((key, i) => (
        <Kbd key={i}>{key}</Kbd>
      ))}
    </div>
  );
}

export function CommandPalette({ open, onOpenChange, onShowShortcuts }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { userWithRoles, hasPermission } = useAuthContext();

  const { addSearch, getSuggestions } = useRecentSearches({ context: 'command-palette' });
  const { navigationCommands: contextualNavCommands } = useCommandMenuCommands();

  const dogs = useDogStore(state => state.dogs);
  const people = useUserStore(state => state.people);
  const shows = useShowStore(state => state.shows);
  const roles = userWithRoles?.roles ?? [];
  const canManageUsers =
    hasPermission(PERMISSIONS.USER_CREATE) || roles.includes(UserRole.SITE_ADMIN);
  const canCreateShows = hasPermission(PERMISSIONS.SHOW_CREATE);
  const canBrowsePeople =
    hasPermission(PERMISSIONS.USER_READ) ||
    roles.includes(UserRole.SECRETARY) ||
    roles.includes(UserRole.SITE_ADMIN);

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
        ...shortcutProp('nav-dogs'),
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
        ...shortcutProp('nav-people'),
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
        ...shortcutProp('nav-shows'),
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
        ...shortcutProp('nav-clubs'),
      },
    ],
    [navigate, onOpenChange]
  );

  const visibleNavigationCommands = useMemo(
    () => navigationCommands.filter(command => command.id !== 'nav-people' || canBrowsePeople),
    [canBrowsePeople, navigationCommands]
  );

  // Build all data commands from full dataset, then let cmdk filter + we slice display
  const allDataCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [];

    for (const dog of dogs) {
      commands.push({
        id: `dog-${dog.id}`,
        title: getDogDisplayName(dog),
        subtitle: `${getDogBreedLabel(dog)} · Go to dog profile`,
        icon: <Dog className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate(`/dogs/${dog.id}`);
            onOpenChange(false);
          }),
        keywords: [dog.name, dog.callName, getDogBreedLabel(dog)].filter(
          Boolean
        ) as string[],
        category: 'data',
      });
    }

    if (canBrowsePeople) {
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
  }, [canBrowsePeople, dogs, people, shows, navigate, onOpenChange]);

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

  const actionCommands: CommandAction[] = useMemo(() => {
    const commands: CommandAction[] = [
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
        category: 'actions',
        ...shortcutProp('add-dog'),
      },
    ];

    if (canManageUsers) {
      commands.push({
        id: 'add-person',
        title: 'Add New User',
        icon: <Plus className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/people?add=true');
            onOpenChange(false);
          }),
        keywords: ['add', 'new', 'create', 'person', 'contact'],
        category: 'actions',
        ...shortcutProp('add-person'),
      });
    }

    if (canCreateShows) {
      commands.push({
        id: 'add-show',
        title: 'Add New Show',
        icon: <Plus className="h-4 w-4" />,
        action: () =>
          startTransition(() => {
            navigate('/?wizard=true');
            onOpenChange(false);
          }),
        keywords: ['add', 'new', 'create', 'show', 'event'],
        category: 'actions',
        ...shortcutProp('add-show'),
      });
    }

    return commands;
  }, [canCreateShows, canManageUsers, navigate, onOpenChange]);

  // Contextual "current show" navigation (task 2.1/2.3) — only present when an
  // owner surface has registered a command-menu context (commandMenuContextStore).
  const contextualCommands: CommandAction[] = useMemo(
    () =>
      contextualNavCommands.map(command =>
        adaptCommandMenuCommand(
          command,
          navigate,
          onOpenChange,
          <ArrowRight className="h-4 w-4" />,
          'navigation'
        )
      ),
    [contextualNavCommands, navigate, onOpenChange]
  );

  const allCommands = useMemo(
    () => [...visibleNavigationCommands, ...contextualCommands, ...dataCommands, ...actionCommands],
    [visibleNavigationCommands, contextualCommands, dataCommands, actionCommands]
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
              {visibleNavigationCommands.map(command => (
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

            {/* Current show — contextual navigation from a registered command-menu
                context (task 2.1/2.3). Absent when no owner surface has registered. */}
            {contextualCommands.length > 0 && (
              <Command.Group heading="Current show" className={groupHeadingClass}>
                {contextualCommands.map(command => (
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
            {onShowShortcuts && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onShowShortcuts();
                }}
                className="ml-auto flex items-center gap-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Kbd size="sm">?</Kbd>
                All shortcuts
              </button>
            )}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
