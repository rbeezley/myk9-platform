import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CommandPalette } from './CommandPalette';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  registerCommandMenuContext,
  useCommandMenuContextStore,
} from '@/features/command-menu/commandMenuContextStore';
import type { CommandMenuContext } from '@/features/command-menu/commandMenuTypes';
import { getShortcutKeysForCommand } from '@/components/layout/appShortcuts';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useRecentSearches', () => ({
  useRecentSearches: () => ({
    addSearch: vi.fn(),
    getSuggestions: () => [],
  }),
}));

type MockDog = { id: string; name: string; callName?: string; registrations?: unknown[] };
let mockDogs: MockDog[] = [];

vi.mock('@/store/dogStore', () => ({
  useDogStore: (selector: (state: { dogs: MockDog[] }) => unknown) =>
    selector({ dogs: mockDogs }),
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

function mockAuth(roles: UserRole[], permissions: string[] = []) {
  vi.mocked(useAuthContext).mockReturnValue({
    userWithRoles: { roles },
    hasPermission: (permission: string) => permissions.includes(permission),
  } as ReturnType<typeof useAuthContext>);
}

function registerEntryManagementContext(
  overrides: Partial<CommandMenuContext> = {}
): () => void {
  return registerCommandMenuContext({
    surface: 'entry-management',
    showId: 'show-1',
    selectedEntryIds: [],
    eligibleCheckInIds: [],
    runBulkCheckIn: vi.fn(),
    busy: false,
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
});

describe('CommandPalette role scoping', () => {
  it('excludes people and user-management commands for exhibitor-only sessions', () => {
    mockAuth([UserRole.EXHIBITOR]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice Handler')).not.toBeInTheDocument();
    expect(screen.queryByText('Add New User')).not.toBeInTheDocument();
    expect(screen.getByText('Add New Dog')).toBeInTheDocument();
  });

  it('keeps staff-authorized people and creation commands available', () => {
    mockAuth([UserRole.SECRETARY], [PERMISSIONS.USER_CREATE, PERMISSIONS.SHOW_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Alice Handler')).toBeInTheDocument();
    expect(screen.getByText('Add New User')).toBeInTheDocument();
    expect(screen.getByText('Add New Show')).toBeInTheDocument();
  });

  it('treats mixed exhibitor and staff sessions as staff when permissions allow it', () => {
    mockAuth([UserRole.EXHIBITOR, UserRole.SECRETARY], [PERMISSIONS.USER_CREATE]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Add New User')).toBeInTheDocument();
  });
});

describe('CommandPalette contextual commands', () => {
  it('shows no Current show group when no context is registered', () => {
    mockAuth([UserRole.SECRETARY]);

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Current show')).not.toBeInTheDocument();
    expect(screen.queryByText(/Open Entry Management/)).not.toBeInTheDocument();
  });

  it('shows contextual Entry Management navigation when a context is registered', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext();

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Open Entry Management — needs review')).toBeInTheDocument();
    expect(screen.getByText('Open Entry Management — payment due')).toBeInTheDocument();
    expect(screen.getByText('Open Entry Management — needs check-in')).toBeInTheDocument();
    expect(screen.getByText('Open Entry Management — all entries')).toBeInTheDocument();
  });

  it('omits Class Management commands when the registered context has no trialId', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext();

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/Open Class Management/)).not.toBeInTheDocument();
  });

  it('includes the Class Management command when the context has a trialId', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext({ trialId: 'trial-1' });

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Open Class Management — current trial')).toBeInTheDocument();
  });
});

describe('CommandPalette check-in command', () => {
  it('is absent when there is no eligible selection', () => {
    mockAuth([UserRole.SECRETARY]);
    registerEntryManagementContext({ selectedEntryIds: ['e1'], eligibleCheckInIds: [] });

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText(/Check in/)).not.toBeInTheDocument();
  });

  it('dispatches the registered handler with the eligible ids and closes the palette', () => {
    mockAuth([UserRole.SECRETARY]);
    const runBulkCheckIn = vi.fn();
    const onOpenChange = vi.fn();
    registerEntryManagementContext({
      selectedEntryIds: ['e1', 'e2'],
      eligibleCheckInIds: ['e1'],
      runBulkCheckIn,
    });

    render(<CommandPalette open onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText('Check in 1 of 2 selected'));

    expect(runBulkCheckIn).toHaveBeenCalledTimes(1);
    expect(runBulkCheckIn).toHaveBeenCalledWith(['e1']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('exposes no mutation command other than check-in (action allowlist)', () => {
    mockAuth([UserRole.SECRETARY], [PERMISSIONS.USER_CREATE, PERMISSIONS.SHOW_CREATE]);
    registerEntryManagementContext({
      selectedEntryIds: ['e1', 'e2'],
      eligibleCheckInIds: ['e1'],
    });

    render(<CommandPalette open onOpenChange={vi.fn()} />);

    // The Actions group is exactly the navigation "Add New ..." shortcuts
    // plus the single allowlisted check-in mutation — no status changes,
    // approvals, rejections, or other registry mutations leak in.
    const actionTitles = [
      'Add New Dog',
      'Add New User',
      'Add New Show',
      'Check in 1 of 2 selected',
    ];
    for (const title of actionTitles) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    for (const forbidden of ['Approve', 'Reject', 'Move to waitlist', 'Withdraw', 'Comp entry']) {
      expect(screen.queryByText(new RegExp(forbidden))).not.toBeInTheDocument();
    }
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
    mockAuth([UserRole.SECRETARY], [PERMISSIONS.USER_CREATE, PERMISSIONS.SHOW_CREATE]);

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

    render(
      <CommandPalette open onOpenChange={onOpenChange} onShowShortcuts={onShowShortcuts} />
    );

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
  it('exhibitor: no Users nav, no people data, no Add New User action', () => {
    mockAuth([UserRole.EXHIBITOR]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Users')).not.toBeInTheDocument();
    expect(screen.queryByText('Add New User')).not.toBeInTheDocument();
    expect(screen.queryByText('Add New Show')).not.toBeInTheDocument();
  });

  it('secretary without USER_CREATE/SHOW_CREATE: browses people but cannot create users/shows', () => {
    mockAuth([UserRole.SECRETARY]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.queryByText('Add New User')).not.toBeInTheDocument();
    expect(screen.queryByText('Add New Show')).not.toBeInTheDocument();
  });

  it('site admin: sees every gated surface', () => {
    mockAuth([UserRole.SITE_ADMIN], [PERMISSIONS.USER_READ]);
    render(<CommandPalette open onOpenChange={vi.fn()} />);

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Add New User')).toBeInTheDocument();
  });
});
