/**
 * Tests for UserDetailsDialog — Security tab (password reset actions)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserDetailsDialog } from './UserDetailsDialog';
import { useAuthContext } from '@/hooks/useAuthContext';
import { mockSupabase } from '@/test/mocks/supabase';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

// Mute sonner toasts in tests — just spy on them
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useUpdateUserMutation: vi.fn(() => ({
    mutateAsync: vi.fn(),
    isPending: false,
  })),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    ensureUserHasRole: vi.fn().mockResolvedValue(undefined),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseAuthContext = vi.mocked(useAuthContext);

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithClient(ui: React.ReactElement) {
  return render(<QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>);
}

/** Returns a minimal AuthContextType-shaped object for the given admin flag. */
function makeAuthContext(isAdmin: boolean) {
  return {
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
    hasRole: vi.fn().mockReturnValue(isAdmin),
    hasPermission: vi.fn().mockReturnValue(isAdmin),
    getUserRoles: vi.fn().mockReturnValue(isAdmin ? ['site_admin'] : []),
    switchUserRole: vi.fn(),
    checkPermissionAsync: vi.fn().mockResolvedValue(isAdmin),
    isAdmin,
    isSecretary: false,
    isExhibitor: !isAdmin,
    isJudge: false,
    dbPermissions: [],
    dbRoles: [],
    rbacLoading: false,
    rbacError: null,
    refreshPermissions: vi.fn().mockResolvedValue(undefined),
  };
}

const mockUser: User = {
  id: 'person-123',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane.doe@example.com',
  roles: [UserRole.EXHIBITOR],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const defaultProps = {
  user: mockUser,
  open: true,
  onOpenChange: vi.fn(),
  onUserUpdated: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('UserDetailsDialog — Security tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default Supabase query responses (roles queries return empty)
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
    }));
  });

  describe('visibility', () => {
    it('does not show the Security tab for non-admin users', () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext(false));
      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      expect(screen.queryByRole('tab', { name: /security/i })).not.toBeInTheDocument();
    });

    it('shows the Security tab for site_admin users', () => {
      mockUseAuthContext.mockReturnValue(makeAuthContext(true));
      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      expect(screen.getByRole('tab', { name: /security/i })).toBeInTheDocument();
    });
  });

  describe('Send Password Reset Email', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue(makeAuthContext(true));
    });

    it('renders the Send Reset Email button inside the Security tab', () => {
      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      // Navigate to Security tab
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      expect(screen.getByTestId('send-reset-email-btn')).toBeInTheDocument();
    });

    it('calls supabase.auth.resetPasswordForEmail with the user email on success', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
      const { toast } = await import('sonner');

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('send-reset-email-btn'));

      await waitFor(() => {
        expect(mockSupabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
          'jane.doe@example.com',
          expect.objectContaining({ redirectTo: expect.stringContaining('/auth/callback') })
        );
        expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('jane.doe@example.com'));
      });
    });

    it('shows an error toast when resetPasswordForEmail fails', async () => {
      mockSupabase.auth.resetPasswordForEmail.mockResolvedValue({
        data: null,
        error: { message: 'User not found', name: 'AuthApiError', status: 422 },
      });
      const { toast } = await import('sonner');

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('send-reset-email-btn'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('User not found'));
      });
    });
  });

  describe('Generate Reset Link', () => {
    beforeEach(() => {
      mockUseAuthContext.mockReturnValue(makeAuthContext(true));
    });

    it('renders the Generate Reset Link button inside the Security tab', () => {
      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      expect(screen.getByTestId('generate-reset-link-btn')).toBeInTheDocument();
    });

    it('calls the admin-generate-reset-link edge function and displays the returned link', async () => {
      const fakeLink = 'https://example.supabase.co/auth/v1/verify?token=abc123&type=recovery';
      mockSupabase.functions.invoke.mockResolvedValue({
        data: { success: true, link: fakeLink },
        error: null,
      });
      const { toast } = await import('sonner');

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('generate-reset-link-btn'));

      await waitFor(() => {
        expect(mockSupabase.functions.invoke).toHaveBeenCalledWith(
          'admin-generate-reset-link',
          expect.objectContaining({ body: { targetEmail: 'jane.doe@example.com' } })
        );
        expect(toast.success).toHaveBeenCalledWith('Reset link generated successfully');
      });

      // The link input should appear with the generated URL
      const linkInput = screen.getByTestId('reset-link-input');
      expect(linkInput).toHaveValue(fakeLink);
    });

    it('shows an error toast when edge function returns an error', async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: null,
        error: new Error('Unauthorized: requires site_admin role'),
      });
      const { toast } = await import('sonner');

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('generate-reset-link-btn'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Unauthorized: requires site_admin role')
        );
      });

      // No link input should be shown
      expect(screen.queryByTestId('reset-link-input')).not.toBeInTheDocument();
    });

    it('shows an error toast when the edge function returns no link', async () => {
      mockSupabase.functions.invoke.mockResolvedValue({
        data: { success: true, link: null },
        error: null,
      });
      const { toast } = await import('sonner');

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('generate-reset-link-btn'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining('No link returned from server')
        );
      });
    });

    it('copies the generated link to clipboard when copy button is clicked', async () => {
      const fakeLink = 'https://example.supabase.co/auth/v1/verify?token=xyz&type=recovery';
      mockSupabase.functions.invoke.mockResolvedValue({
        data: { success: true, link: fakeLink },
        error: null,
      });

      renderWithClient(<UserDetailsDialog {...defaultProps} />);
      fireEvent.click(screen.getByRole('tab', { name: /security/i }));
      fireEvent.click(screen.getByTestId('generate-reset-link-btn'));

      await waitFor(() => screen.getByTestId('copy-reset-link-btn'));

      fireEvent.click(screen.getByTestId('copy-reset-link-btn'));

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(fakeLink);
      });
    });
  });
});
