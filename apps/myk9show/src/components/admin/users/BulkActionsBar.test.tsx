/**
 * Unit tests for BulkActionsBar component
 * Tests bulk operations, user deletion, and user interface interactions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BulkActionsBar } from './BulkActionsBar';
import {
  useDeleteUserMutation,
  usePermanentDeleteUserMutation,
} from '@/hooks/queries/useUsersQuery';
import { useAuthContext } from '@/hooks/useAuthContext';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

// Mock the mutation hooks
vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useDeleteUserMutation: vi.fn(),
  usePermanentDeleteUserMutation: vi.fn(),
}));

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

const mockUseDeleteUserMutation = vi.mocked(useDeleteUserMutation);
const mockUsePermanentDeleteUserMutation = vi.mocked(usePermanentDeleteUserMutation);
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

const defaultProps = {
  selectedUsers: mockSelectedUsers,
  onClearSelection: vi.fn(),
  onBulkComplete: vi.fn(),
  onUsersDeleted: vi.fn(),
};

describe('BulkActionsBar', () => {
  const mockMutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup the mutation hook mock
    mockUseDeleteUserMutation.mockReturnValue({
      mutateAsync: mockMutateAsync,
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'idle' as const,
      submittedAt: 0,
      variables: undefined,
      context: undefined,
    });

    // Default to non-admin (existing tests stay the same)
    mockUseAuthContext.mockReturnValue({
      user: null,
      userWithRoles: null,
      loading: false,
      signIn: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
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
      rbacLoading: false,
      rbacError: null,
      refreshPermissions: vi.fn().mockResolvedValue(undefined),
    });

    // Setup permanent delete mutation mock
    mockUsePermanentDeleteUserMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
      reset: vi.fn(),
      isIdle: true,
      isSuccess: false,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'idle' as const,
      submittedAt: 0,
      variables: undefined,
      context: undefined,
    });
  });

  it('renders when users are selected', () => {
    render(<BulkActionsBar {...defaultProps} />);

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText(/Selected users: John Doe, Jane Smith/)).toBeInTheDocument();
  });

  it('does not render when no users are selected', () => {
    render(<BulkActionsBar {...defaultProps} selectedUsers={[]} />);

    expect(screen.queryByText('selected')).not.toBeInTheDocument();
  });

  it('shows correct user count and names', () => {
    render(<BulkActionsBar {...defaultProps} />);

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText(/Selected users: John Doe, Jane Smith/)).toBeInTheDocument();
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

    expect(screen.getByText('4 selected')).toBeInTheDocument();
    expect(
      screen.getByText(/Selected users: John Doe, Jane Smith, Bob Johnson and 1 more/)
    ).toBeInTheDocument();
  });

  it('calls onClearSelection when clear button is clicked', () => {
    const mockClear = vi.fn();
    render(<BulkActionsBar {...defaultProps} onClearSelection={mockClear} />);

    // The clear button is the one with just the X icon and no text
    const buttons = screen.getAllByRole('button');
    const clearButton = buttons.find(
      button =>
        button.className.includes('h-8 w-8 p-0') &&
        button.querySelector('svg')?.classList.contains('lucide-x')
    );

    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton!);

    expect(mockClear).toHaveBeenCalledOnce();
  });

  describe('Bulk Delete functionality', () => {
    it('opens delete confirmation dialog when delete button is clicked', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(screen.getAllByText('Delete Users')).toHaveLength(2); // Title and button
      expect(
        screen.getByText(/Are you sure you want to delete 2 selected users/)
      ).toBeInTheDocument();
    });

    it('shows user details in delete confirmation dialog', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      expect(screen.getByText('John Doe (john.doe@example.com)')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith (jane.smith@example.com)')).toBeInTheDocument();
    });

    it('cancels delete operation when cancel button is clicked', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      fireEvent.click(cancelButton);

      expect(screen.queryByText('Delete Users')).not.toBeInTheDocument();
    });

    it('successfully deletes users when confirmed', async () => {
      mockMutateAsync.mockResolvedValue(undefined);
      const mockOnUsersDeleted = vi.fn();
      const mockOnBulkComplete = vi.fn();

      render(
        <BulkActionsBar
          {...defaultProps}
          onUsersDeleted={mockOnUsersDeleted}
          onBulkComplete={mockOnBulkComplete}
        />
      );

      // Open delete dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /delete users/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        // Source calls mutateAsync({ id: userId }) without cascadeDelete
        expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'user-1' });
        expect(mockMutateAsync).toHaveBeenCalledWith({ id: 'user-2' });
        expect(mockMutateAsync).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(mockOnUsersDeleted).toHaveBeenCalledWith(['user-1', 'user-2']);
        expect(mockOnBulkComplete).toHaveBeenCalledOnce();
      });
    });

    it('handles delete errors gracefully', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Database connection failed'));

      render(<BulkActionsBar {...defaultProps} />);

      // Open delete dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /delete users/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/Database connection failed/)).toBeInTheDocument();
      });
    });

    it('shows loading state during deletion', async () => {
      // Mock a delay in deletion
      mockMutateAsync.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(undefined), 100))
      );

      render(<BulkActionsBar {...defaultProps} />);

      // Open delete dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /delete users/i });
      fireEvent.click(confirmButton);

      // Check loading state
      expect(screen.getByText('Deleting...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Deleting...')).not.toBeInTheDocument();
      });
    });

    it('handles individual user deletion failures', async () => {
      mockMutateAsync
        .mockResolvedValueOnce(undefined) // First user succeeds
        .mockRejectedValueOnce(
          new Error(
            'Cannot delete user: This user is associated with show entries. Please remove or reassign entries before deleting the user.'
          )
        ); // Second user fails

      render(<BulkActionsBar {...defaultProps} />);

      // Open delete dialog
      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Confirm deletion
      const confirmButton = screen.getByRole('button', { name: /delete users/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.getByText(/Cannot delete user: This user is associated with show entries/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Bulk Actions Menu', () => {
    it('renders role management button', () => {
      render(<BulkActionsBar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /roles/i })).toBeInTheDocument();
    });

    it('renders status management button', () => {
      render(<BulkActionsBar {...defaultProps} />);

      expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      expect(deleteButton).toBeInTheDocument();

      // Check that buttons are accessible
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('supports keyboard navigation', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      deleteButton.focus();
      expect(deleteButton).toHaveFocus();
    });
  });

  describe('Site Admin Delete', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue({
        user: null,
        userWithRoles: null,
        loading: false,
        signIn: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
        resetPassword: vi.fn(),
        updatePassword: vi.fn(),
        updateProfile: vi.fn(),
        hasRole: vi.fn().mockReturnValue(true),
        hasPermission: vi.fn().mockReturnValue(true),
        getUserRoles: vi.fn().mockReturnValue(['site_admin']),
        switchUserRole: vi.fn(),
        checkPermissionAsync: vi.fn().mockResolvedValue(true),
        isAdmin: true,
        isSecretary: false,
        isExhibitor: false,
        isJudge: false,
        dbPermissions: [],
        dbRoles: [],
        rbacLoading: false,
        rbacError: null,
        refreshPermissions: vi.fn().mockResolvedValue(undefined),
      });
    });

    it('shows AdminDeleteUserDialog with soft/permanent options for admins', () => {
      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Should show the admin dialog with radio options
      expect(screen.getByLabelText(/Deactivate/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Permanently delete/)).toBeInTheDocument();
    });

    it('calls soft delete when deactivate is chosen', async () => {
      mockMutateAsync.mockResolvedValue(undefined);

      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      // Deactivate is default
      const confirmButton = screen.getByRole('button', { name: /deactivate/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockMutateAsync).toHaveBeenCalled();
      });
    });

    it('calls permanent delete when permanently delete is chosen', async () => {
      const mockPermanentMutateAsync = vi.fn().mockResolvedValue(undefined);
      mockUsePermanentDeleteUserMutation.mockReturnValue({
        mutateAsync: mockPermanentMutateAsync,
        mutate: vi.fn(),
        isPending: false,
        isError: false,
        error: null,
        data: undefined,
        reset: vi.fn(),
        isIdle: true,
        isSuccess: false,
        failureCount: 0,
        failureReason: null,
        isPaused: false,
        status: 'idle' as const,
        submittedAt: 0,
        variables: undefined,
        context: undefined,
      });

      render(<BulkActionsBar {...defaultProps} />);

      const deleteButton = screen.getByRole('button', { name: /delete/i });
      fireEvent.click(deleteButton);

      const permanentRadio = screen.getByLabelText(/Permanently delete/);
      fireEvent.click(permanentRadio);

      const confirmButton = screen.getByRole('button', { name: /permanently delete/i });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockPermanentMutateAsync).toHaveBeenCalledWith({ id: 'user-1' });
        expect(mockPermanentMutateAsync).toHaveBeenCalledWith({ id: 'user-2' });
      });
    });
  });
});
