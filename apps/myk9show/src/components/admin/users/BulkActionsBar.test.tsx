/**
 * Unit tests for BulkActionsBar component
 * Tests bulk operations, user deletion (through the shared delete dialog), and
 * user interface interactions
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BulkActionsBar } from './BulkActionsBar';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';

vi.mock('@/services/database/users', () => ({
  restoreUser: vi.fn().mockResolvedValue({ error: null }),
}));
vi.mock('@/components/users/UserDetails/useSendUserInvitation', () => ({
  invokeAdminInvite: vi.fn().mockResolvedValue({ data: null }),
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: vi.fn(() => ({ mutateAsync: vi.fn() })),
}));

// The shared delete dialog's server and device halves (features/delete).
const deleteMocks = vi.hoisted(() => ({ preview: vi.fn(), remove: vi.fn(), purge: vi.fn() }));
vi.mock('@/features/delete/deletePreview', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deletePreview')>()),
  fetchDeletePreview: deleteMocks.preview,
}));
vi.mock('@/features/delete/deleteUnsyncedWork', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/delete/deleteUnsyncedWork')>()),
  deviceHasUnsavedWork: vi.fn().mockResolvedValue({ total: 0, failed: 0 }),
}));
vi.mock('@/features/delete/deleteServer', () => ({
  softDeleteOnServer: deleteMocks.remove,
  restoreOnServer: vi.fn(),
}));
vi.mock('@/features/delete/deleteLocalState', () => ({
  reconcileLocalDeletion: deleteMocks.purge,
}));
const preview = (dogs: number) => ({
  trials: 0,
  classes: 0,
  entries: 0,
  shows: 0,
  dogs,
  paid: 0,
  scored: 0,
  blocking: dogs,
});

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

// A clubs-list query — resolve empty so opening a dialog doesn't
// hit a real client.
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn(() => Promise.resolve([])),
    clearAllCache: vi.fn(),
    clearUserCache: vi.fn(),
  },
}));

const mockUseAuthContext = vi.mocked(useAuthContext);

// Mock data
const mockSelectedUsers: SelectedUser[] = [
  {
    id: 'user-1',
    user: {
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      roles: [UserRole.EXHIBITOR],
      createdAt: new Date('2023-01-01'),
      updatedAt: new Date('2023-01-01'),
    },
  },
  {
    id: 'user-2',
    user: {
      id: 'user-2',
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      roles: [UserRole.SECRETARY],
      createdAt: new Date('2023-01-02'),
      updatedAt: new Date('2023-01-02'),
    },
  },
];

// Components rendered by this bar (the delete dialog) read via useQuery —
// wrap every render in a QueryClientProvider so those hooks don't throw
// outside a provider.
function render(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// The live roster (MYK9-835/MYK9-820): both people active, live, never signed
// in, so account actions and role editing resolve the same eligibility the
// old flattened SelectedUser snapshot used to assert.
const mockAdminUsers: AdminUser[] = mockSelectedUsers.map(({ user }) => ({
  ...user,
  status: 'active',
  lastSignInAt: null,
}));

const defaultProps = {
  selectedUsers: mockSelectedUsers,
  users: mockAdminUsers,
  onClearSelection: vi.fn(),
  onBulkComplete: vi.fn(),
  onUsersDeleted: vi.fn(),
};

/**
 * The "Selected users:" label is screen-reader-only, so the visible names and
 * their label live in two elements. Read the paragraph's full text instead of
 * matching a single text node.
 */
function selectedUsersText(): string {
  const paragraph = screen
    .getAllByText((_, element) => element?.tagName === 'P')
    .find(element => element.textContent?.startsWith('Selected users:'));
  return paragraph?.textContent ?? '';
}

describe('BulkActionsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    deleteMocks.preview.mockReset().mockResolvedValue(preview(0));
    deleteMocks.remove.mockReset().mockResolvedValue(undefined);
    deleteMocks.purge.mockReset().mockResolvedValue(undefined);

    // Default to non-admin (existing tests stay the same)
    mockUseAuthContext.mockReturnValue({
      user: null,
      userWithRoles: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      resendConfirmationEmail: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
      signInWithApple: vi.fn(),
      resetPassword: vi.fn(),
      updatePassword: vi.fn(),
      updateProfile: vi.fn(),
      hasRole: vi.fn().mockReturnValue(false),
      hasPermission: vi.fn().mockReturnValue(false),
      getUserRoles: vi.fn().mockReturnValue([]),
      switchUserRole: vi.fn(),
      checkPermissionAsync: vi.fn().mockResolvedValue(false),
      isAdmin: false,
      isSecretary: false,
      isExhibitor: false,
      isJudge: false,
      dbPermissions: [],
      dbRoles: [],
      rbacUserRoles: [],
      rbacScopedPermissions: [],
      rbacLoading: false,
      rbacError: null,
      rbacLastRefreshed: null,
      rbacFromCacheAt: null,
      refreshPermissions: vi.fn().mockResolvedValue(undefined),
      firstName: null,
      lastName: null,
    });
  });

  it('renders when users are selected', () => {
    render(<BulkActionsBar {...defaultProps} />);

    expect(screen.getByText('2 users selected')).toBeInTheDocument();
    expect(selectedUsersText()).toBe('Selected users: John Doe, Jane Smith');
  });

  it('does not render when no users are selected', () => {
    render(<BulkActionsBar {...defaultProps} selectedUsers={[]} />);

    expect(screen.queryByText('selected')).not.toBeInTheDocument();
  });

  it('shows correct user count and names', () => {
    render(<BulkActionsBar {...defaultProps} />);

    expect(screen.getByText('2 users selected')).toBeInTheDocument();
    expect(selectedUsersText()).toBe('Selected users: John Doe, Jane Smith');
  });

  it('truncates user list when more than 3 users selected', () => {
    const manyUsers: SelectedUser[] = [
      ...mockSelectedUsers,
      {
        id: 'user-3',
        user: {
          id: 'user-3',
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@example.com',
          roles: [UserRole.JUDGE],
          createdAt: new Date('2023-01-03'),
          updatedAt: new Date('2023-01-03'),
        },
      },
      {
        id: 'user-4',
        user: {
          id: 'user-4',
          firstName: 'Alice',
          lastName: 'Wilson',
          email: 'alice@example.com',
          roles: [UserRole.EXHIBITOR],
          createdAt: new Date('2023-01-04'),
          updatedAt: new Date('2023-01-04'),
        },
      },
    ];

    render(<BulkActionsBar {...defaultProps} selectedUsers={manyUsers} />);

    expect(screen.getByText('4 users selected')).toBeInTheDocument();
    expect(selectedUsersText()).toBe(
      'Selected users: John Doe, Jane Smith, Bob Johnson and 1 more'
    );
  });

  it('calls onClearSelection when clear button is clicked', () => {
    const mockClear = vi.fn();
    render(<BulkActionsBar {...defaultProps} onClearSelection={mockClear} />);

    // Found by its accessible name, not its size classes — the icon-only button
    // is 44px now, and a class-based query breaks on every restyle.
    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));

    expect(mockClear).toHaveBeenCalledOnce();
  });

  // Bulk delete is the shared DeleteObjectDialog (CRUD standard Phase 2): soft,
  // with Undo, and a person who still owns dogs is named and blocked up front.
  // Permanent purge lives on Admin -> Deleted Items, not here.
  describe('Bulk Delete functionality', () => {
    it('asks through the shared dialog, naming the people and the buttons plainly', async () => {
      render(<BulkActionsBar {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));

      const dialog = await screen.findByRole('alertdialog', { name: 'Delete 2 people?' });
      expect(within(dialog).getByText('John Doe and Jane Smith')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Keep it' })).toBeInTheDocument();
      await waitFor(() =>
        expect(within(dialog).getByRole('button', { name: 'Delete 2 people' })).toBeEnabled()
      );
      expect(deleteMocks.remove).not.toHaveBeenCalled();
    });

    it('Keep it closes the dialog without deleting', async () => {
      render(<BulkActionsBar {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      const dialog = await screen.findByRole('alertdialog');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
      expect(deleteMocks.remove).not.toHaveBeenCalled();
    });

    it('deletes every selected person and reports them as deleted', async () => {
      const onUsersDeleted = vi.fn();
      const onBulkComplete = vi.fn();
      render(
        <BulkActionsBar
          {...defaultProps}
          onUsersDeleted={onUsersDeleted}
          onBulkComplete={onBulkComplete}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      const dialog = await screen.findByRole('alertdialog');
      const confirm = within(dialog).getByRole('button', { name: 'Delete 2 people' });
      await waitFor(() => expect(confirm).toBeEnabled());
      fireEvent.click(confirm);

      await waitFor(() => expect(onUsersDeleted).toHaveBeenCalledWith(['user-1', 'user-2']));
      expect(onBulkComplete).toHaveBeenCalledWith(['user-1', 'user-2']);
      expect(deleteMocks.remove).toHaveBeenCalledWith('person', 'user-1', { override: false });
      expect(deleteMocks.remove).toHaveBeenCalledWith('person', 'user-2', { override: false });
    });

    it('names a person who still owns dogs and keeps Delete off', async () => {
      deleteMocks.preview.mockImplementation(async (_kind: string, id: string) =>
        id === 'user-2' ? preview(2) : preview(0)
      );
      render(<BulkActionsBar {...defaultProps} />);

      fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
      const dialog = await screen.findByRole('alertdialog');

      expect(
        await within(dialog).findByText(
          'Jane Smith still owns dogs. Leave it out of the selection to delete the rest.'
        )
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Delete 2 people' })).toBeDisabled();
    });
  });

  describe('Bulk Actions Menu', () => {
    it('offers a Change roles action (MYK9-820)', () => {
      render(<BulkActionsBar {...defaultProps} />);
      expect(screen.getByRole('button', { name: 'Change roles' })).toBeInTheDocument();
    });

    // Suspend/Reinstate need admin:manage (hasPermission returns false by
    // default in this file); Send invitation does not, and both selected
    // people are live and have never signed in, so it still shows (MYK9-835).
    it('hides Suspend and Reinstate without admin:manage, but still offers eligible actions', () => {
      render(<BulkActionsBar {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reinstate/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send invitation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    });

    it('copies the selected emails from the More menu', async () => {
      render(<BulkActionsBar {...defaultProps} />);
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy emails' }));

      await waitFor(() =>
        expect(writeText).toHaveBeenCalledWith('john.doe@example.com, jane.smith@example.com')
      );
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /^delete$/i });
      expect(deleteButton).toBeInTheDocument();

      // Check that buttons are accessible
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('supports keyboard navigation', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /^delete$/i });
      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
    });
  });
});
