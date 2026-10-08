import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { render } from '@/test/utils/testUtils';
import { CommandPalette } from './CommandPalette';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import { PERMISSIONS as RBAC_PERMISSIONS } from '@/services/auth/rbacService';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  registerCommandMenuContext,
  useCommandMenuContextStore,
} from '@/features/command-menu/commandMenuContextStore';
import type { CommandMenuContext } from '@/features/command-menu/commandMenuTypes';
import { getShortcutKeysForCommand } from '@/components/layout/appShortcuts';
import { resolveActions, type AppAction } from '@/features/actions/actionRegistry';

const currentActions = vi.hoisted(() => ({
  value: { route: { kind: 'global' }, actions: [] } as { route: unknown; actions: unknown[] },
}));

vi.mock('@/features/actions/useCurrentActions', async importOriginal => {
  // The registry -> palette contract has its own test
  // (features/command-menu/__tests__/commandMenuRegistryActions.test.tsx).
  // Stubbed here so this file's per-test useAuthContext mocks do not each have
  // to carry the show-management RBAC the registry reads. A test that needs
  // show actions sets `currentActions.value` from the real `resolveActions`.
  //
  // The Create group is appended from the REAL registry and the REAL gates, under the
  // viewer `mockAuth` set, because the palette's create commands now come from it.
  const actual = await importOriginal<typeof import('@/features/actions/useCurrentActions')>();
  const { resolveCreateGates } = await vi.importActual<
    typeof import('@/features/actions/createGates')
  >('@/features/actions/createGates');
  const { groupActions } = await vi.importActual<typeof import('@/features/actions/actionGroups')>(
    '@/features/actions/actionGroups'
  );
  const registry = await vi.importActual<typeof import('@/features/actions/actionRegistry')>(
    '@/features/actions/actionRegistry'
  );
  const auth = await import('@/hooks/useAuthContext');
  return {
    ...actual,
    useCurrentActions: () => {
      const gates = resolveCreateGates(auth.useAuthContext());
      const creates = registry
        .resolveActions(
          { kind: 'global' },
          { canManageShow: false, canOperateShow: false, ...gates }
        )
        .filter(action => action.group === 'create');
      const actions = [...(currentActions.value.actions as AppAction[]), ...creates];
      return {
        ...currentActions.value,
        actions,
        groups: groupActions(actions, {
          page: 'This page',
          show: 'This show',
          list: 'This list',
          create: 'Create',
        }),
      };
    },
  };
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useRecentSearches', () => ({
  useRecentSearches: () => ({
    addSearch: vi.fn(),
    getSuggestions: () => [],
  }),
}));

type MockDog = { id: string; name: string | null; callName?: string; registrations?: unknown[] };
let mockDogs: MockDog[] = [];

vi.mock('@/store/dogStore', () => ({
  // The deprecated store stays empty in production, even on the Dogs page.
  useDogStore: (selector: (state: { dogs: MockDog[] }) => unknown) => selector({ dogs: [] }),
}));

vi.mock('@/hooks/queries/useDogsDatabase', () => ({
  useDogsQuery: () => ({
    data: mockDogs.map(dog => ({ ...dog, call_name: dog.callName })),
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@/store/userStore', () => ({
  useUserStore: (
    selector: (state: {
      people: Array<{ id: string; firstName: string; lastName: string }>;
    }) => unknown
  ) => selector({ people: [{ id: 'person-1', firstName: 'Alice', lastName: 'Handler' }] }),
}));

vi.mock('@/store/showStore', () => ({
  useShowStore: (
    selector: (state: {
      shows: Array<{ id: string; name: string; location: string; organization: string }>;
    }) => unknown
  ) =>
    selector({
      shows: [
        {
          id: 'show-1',
          name: 'Spring Trial',
          location: 'Denver',
          organization: 'AKC',
        },
      ],
    }),
}));

vi.mock('@/store/clubStore', () => ({
  useClubStore: (selector: (state: { clubs: unknown[] }) => unknown) =>
    selector({
      clubs: ['Heartland Scent Club', 'E2E Club 174'].map((name, i) => ({
        id: `club-${i}`,
        name,
        clubNumber: '',
        email: '',
        phone: '',
        description: '',
        logo: '',
        coverImage: '',
        accentColor: '',
        upcomingShows: [],
        pastShows: [],
        address: { street: '', city: 'Austin', state: 'TX', zipCode: '', country: 'US' },
      })),
    }),
}));

function mockAuth(roles: UserRole[], permissions: string[] = []) {
  vi.mocked(useAuthContext).mockReturnValue({
    user: { id: 'viewer', is_anonymous: false },
    loading: false,
    userWithRoles: { roles },
    hasRole: (role: UserRole) => roles.includes(role),
    hasPermission: (permission: string) => permissions.includes(permission),
  } as ReturnType<typeof useAuthContext>);
}

function registerEntryManagementContext(overrides: Partial<CommandMenuContext> = {}): () => void {
  return registerCommandMenuContext({
    surface: 'entry-management',
    showId: 'show-1',
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDogs = [];
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  // Reset the real zustand context store between tests.
  useCommandMenuContextStore.setState({ context: null, token: 0 });
  currentActions.value = { route: { kind: 'global' }, actions: [] };
});

describe('CommandPalette show-action aliases (MYK9-672)', () => {
  function renderOnShowPage() {
    mockAuth([UserRole.SECRETARY]);
    currentActions.value = {
      route: { kind: 'show', showId: 'show-1', shellMounted: true },
      actions: resolveActions(
        { kind: 'show', showId: 'show-1', shellMounted: true },
        {
          canManageShow: true,
          canOperateShow: true,
          canCreateShows: true,
          canCreateDogs: true,
          canCreatePeople: true,
          canCreateClubs: true,
        }
      ),
    };
    render(<CommandPalette open onOpenChange={vi.fn()} />);
  }

  it.each(['mail', 'paper', 'phone', 'walk-up'])(
    'typing "%s" finds the on-behalf entry action',
    term => {
      renderOnShowPage();
      fireEvent.change(screen.getByPlaceholderText(/search dogs, people, shows/i), {
        target: { value: term },
      });

      expect(screen.getByRole('option', { name: /add entry for someone else/i })).toBeVisible();
    }
  );

  it('keeps the visible label free of the aliases', () => {
    renderOnShowPage();

    const option = screen.getByRole('option', { name: /add entry for someone else/i });
    expect(option).toHaveTextContent('Add entry for someone else');
    expect(option).not.toHaveTextContent(/mail|paper|phone|walk-up|on behalf/i);
  });
});

describe('CommandPalette role scoping', () => {
  it('excludes people and user-management commands for exhibitor-only sessions', () => {
    // An exhibitor holds dog:create (DEFAULT_ROLE_PERMISSIONS), so Add Dog stays.
    mockAuth([UserRole.EXHIBITOR], [PERMISSIONS.DOG_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice Handler')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Person')).not.toBeInTheDocument();
    expect(screen.getByText('Add Dog')).toBeInTheDocument();
  });

  it('keeps staff-authorized people and creation commands available', () => {
    mockAuth([UserRole.SECRETARY], [RBAC_PERMISSIONS.PEOPLE_CREATE, PERMISSIONS.SHOW_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Add Person')).toBeInTheDocument();
    expect(screen.getByText('Add Show')).toBeInTheDocument();
  });

  it('treats mixed exhibitor and staff sessions as staff when permissions allow it', () => {
    mockAuth([UserRole.EXHIBITOR, UserRole.SECRETARY], [RBAC_PERMISSIONS.PEOPLE_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Add Person')).toBeInTheDocument();
  });
});

describe('CommandPalette contextual commands', () => {
  it('shows no Current show group when no context is registered', () => {
    mockAuth([UserRole.SECRETARY]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Current show')).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Entry Forms/)).not.toBeInTheDocument();
  });

  it('shows contextual Entry Management navigation when a context is registered', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext();

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Open Entry Forms — needs review')).toBeInTheDocument();
    expect(screen.getByText('Open Entry Forms — payment due')).toBeInTheDocument();
    expect(screen.getByText('Open Entry Forms — needs check-in')).toBeInTheDocument();
    // MYK9-630: the unfiltered "all entries" preset was replaced by the
    // action registry's "Open Entry Management", which the header Actions
    // menu and the palette both render from one list.
    expect(screen.queryByText('Open Entry Forms — all entries')).not.toBeInTheDocument();
  });

  it('offers no Class Management command: the page is now Setup → Classes', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext({ trialId: 'trial-1' });

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/Open Class Management/)).not.toBeInTheDocument();
  });
});

describe('CommandPalette Entry Management context', () => {
  it('does not add Entry Management mutations', () => {
    mockAuth([UserRole.SECRETARY], [RBAC_PERMISSIONS.PEOPLE_CREATE, PERMISSIONS.SHOW_CREATE]);
    registerEntryManagementContext();

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    const actionTitles = ['Add Person', 'Add Show', 'Add Club'];
    for (const title of actionTitles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const forbidden of [
      'Check in',
      'Approve',
      'Reject',
      'Move to waitlist',
      'Withdraw',
      'Comp entry',
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });
});

function CurrentPath() {
  return <output>{useLocation().pathname}</output>;
}

describe('CommandPalette dog search', () => {
  it('finds a current roster dog by call name and opens its profile', () => {
    mockAuth([UserRole.SECRETARY]);
    // Modern dog records have a call_name and no legacy name.
    mockDogs = [{ id: 'coco-id', name: null, callName: 'COCO', registrations: [] }];
    const onOpenChange = vi.fn();
    render(
      <>
        <CommandPalette open onOpenChange={onOpenChange} />
        <CurrentPath />
      </>
    );

    fireEvent.change(screen.getByPlaceholderText(/search dogs, people, shows/i), {
      target: { value: 'coco' },
    });

    fireEvent.click(screen.getByText('COCO'));
    expect(screen.getByText('/dogs/coco-id')).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('CommandPalette other record searches', () => {
  it.each([
    ['ALICE', 'Alice Handler', '/people/person-1'],
    ['handler', 'Alice Handler', '/people/person-1'],
    ['alice handler', 'Alice Handler', '/people/person-1'],
    ['spring', 'Spring Trial', '/shows/show-1'],
    ['DENVER', 'Spring Trial', '/shows/show-1'],
    ['akc', 'Spring Trial', '/shows/show-1'],
    ['HEARTLAND', 'Heartland Scent Club', '/clubs/club-0'],
  ])('searching %s opens %s at %s', (term, label, path) => {
    mockAuth([UserRole.SECRETARY]);
    const onOpenChange = vi.fn();
    render(
      <>
        <CommandPalette open onOpenChange={onOpenChange} />
        <CurrentPath />
      </>
    );
    fireEvent.change(screen.getByPlaceholderText(/search dogs, people, shows/i), {
      target: { value: term },
    });
    fireEvent.click(screen.getByText(label));
    expect(screen.getByText(path)).toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([UserRole.EXHIBITOR, UserRole.SECRETARY, UserRole.SITE_ADMIN])(
    'preserves directory visibility for %s',
    role => {
      mockAuth([role]);
      render(<CommandPalette open onOpenChange={vi.fn()} />);
      fireEvent.change(screen.getByPlaceholderText(/search dogs, people, shows/i), {
        target: { value: 'E2E Club' },
      });
      expect(Boolean(screen.queryByText('E2E Club 174'))).toBe(role === UserRole.SITE_ADMIN);
    }
  );

  it('does not expose cached club records to a passcode session', () => {
    mockAuth([UserRole.SECRETARY]);
    vi.mocked(useAuthContext).mockReturnValue({
      ...useAuthContext(),
      user: { id: 'passcode', is_anonymous: true },
    } as ReturnType<typeof useAuthContext>);
    render(<CommandPalette open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search dogs, people, shows/i), {
      target: { value: 'Heartland' },
    });
    expect(screen.queryByText('Heartland Scent Club')).not.toBeInTheDocument();
  });
});

describe('CommandPalette bounded results', () => {
  it('caps data results at MAX_DATA_RESULTS', () => {
    mockAuth([UserRole.EXHIBITOR]);
    mockDogs = Array.from({ length: 10 }, (_, i) => ({
      id: `dog-${i}`,
      name: `Rover ${i}`,
      registrations: [],
    }));

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    const rendered = screen.getAllByText(/^Rover \d+$/);
    expect(rendered).toHaveLength(5);
  });
});

describe('CommandPalette shortcut badges (task 3.1)', () => {
  it('every palette command with a shortcut badge resolves to a real, registered shortcut', () => {
    // Guards against provenance drift: every id the palette assigns a
    // `shortcutProp(...)` call to must exist in the canonical appShortcuts.ts
    // table, and the check-in mutation (no keyboard shortcut) must not.
    const paletteCommandIds = [
      'nav-dogs',
      'nav-people',
      'nav-shows',
      'nav-clubs',
      'add-dog',
      'add-person',
      'add-show',
    ];

    for (const commandId of paletteCommandIds) {
      expect(getShortcutKeysForCommand(commandId)).toBeDefined();
    }
    expect(getShortcutKeysForCommand('check-in')).toBeUndefined();
  });

  it('renders the registered key badges next to their commands', () => {
    mockAuth([UserRole.SECRETARY], [RBAC_PERMISSIONS.PEOPLE_CREATE, PERMISSIONS.SHOW_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    // Each shortcut renders as separate <Kbd> key segments (e.g. "G D" -> "G", "D").
    expect(screen.getAllByText('G').length).toBeGreaterThan(0);
    expect(screen.getAllByText('C').length).toBeGreaterThan(0);
  });
});

describe('CommandPalette keyboard and selection behavior (task 3.2)', () => {
  it('closes on Escape', async () => {
    mockAuth([UserRole.EXHIBITOR]);
    const onOpenChange = vi.fn();

    const { user } = render(<CommandPalette open onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it('navigating to a static navigation result closes the palette', () => {
    mockAuth([UserRole.EXHIBITOR]);
    const onOpenChange = vi.fn();

    render(<CommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText('Dogs'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('selecting a data result (a dog) closes the palette', () => {
    mockAuth([UserRole.EXHIBITOR]);
    mockDogs = [{ id: 'dog-1', name: 'Rover', registrations: [] }];
    const onOpenChange = vi.fn();

    render(<CommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText('Rover'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('CommandPalette shortcuts-help footer (task 3.1/3.2)', () => {
  it('clicking the "All shortcuts" footer button closes the palette and opens the overlay', () => {
    mockAuth([UserRole.EXHIBITOR]);
    const onOpenChange = vi.fn();
    const onShowShortcuts = vi.fn();

    render(<CommandPalette open onOpenChange={onOpenChange} onShowShortcuts={onShowShortcuts} />);

    fireEvent.click(screen.getByRole('button', { name: /all shortcuts/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onShowShortcuts).toHaveBeenCalledTimes(1);
  });

  it('hides the footer hint entirely when no onShowShortcuts handler is provided', () => {
    mockAuth([UserRole.EXHIBITOR]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('All shortcuts')).not.toBeInTheDocument();
  });

  it('typing "?" into the palette search input does not trigger the shortcuts handler', async () => {
    mockAuth([UserRole.EXHIBITOR]);
    const onShowShortcuts = vi.fn();

    const { user } = render(
      <CommandPalette open onOpenChange={vi.fn()} onShowShortcuts={onShowShortcuts} />
    );

    const input = screen.getByPlaceholderText(/search dogs, people, shows/i);
    input.focus();
    await user.keyboard('?');

    expect(onShowShortcuts).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe('?');
  });
});

describe('CommandPalette permission suppression role matrix (task 3.2)', () => {
  it('exhibitor: no Users nav, no people data, no Add Person action', () => {
    mockAuth([UserRole.EXHIBITOR]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Show')).not.toBeInTheDocument();
  });

  it('secretary without PEOPLE_CREATE/SHOW_CREATE: browses people but cannot create people/shows', () => {
    mockAuth([UserRole.SECRETARY]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.queryByText('Add Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Add Show')).not.toBeInTheDocument();
  });

  it('site admin: sees every gated surface', () => {
    // Add Person follows people:create, the gate BrowsePeoplePage's own button uses; site
    // admins hold it (migration 140).
    mockAuth([UserRole.SITE_ADMIN], [PERMISSIONS.USER_READ, RBAC_PERMISSIONS.PEOPLE_CREATE]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Add Person')).toBeInTheDocument();
  });
});
