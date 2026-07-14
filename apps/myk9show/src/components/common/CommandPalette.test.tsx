import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CommandPalette } from './CommandPalette';
import { PERMISSIONS, UserRole } from '@/types/auth-types';
import { useAuthContext } from '@/hooks/useAuthContext';

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

vi.mock('@/hooks/useRecentSearches', () => ({
  useRecentSearches: () => ({
    addSearch: vi.fn(),
    getSuggestions: () => [],
  }),
}));

vi.mock('@/store/dogStore', () => ({
  useDogStore: (selector: (state: { dogs: unknown[] }) => unknown) => selector({ dogs: [] }),
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

describe('CommandPalette role scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
  });

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
