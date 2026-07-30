import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { UserRole } from '@/types/auth-types';

export const mockUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
};

export const mockAuthReturn = {
  user: mockUser,
  loading: false,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
  updateProfile: vi.fn(),
};

export function accessForRole(role: UserRole) {
  return {
    roles: [
      {
        role_id: `role-${role}`,
        role: { name: role, display_name: role },
        is_active: true,
      },
    ],
    permissions: [],
    effectivePermissions: [],
    effectivePermissionScopes: [],
  };
}

type AuthProviderComponent = React.ComponentType<{ children: React.ReactNode }>;

export function createAuthWrapper(
  AuthProvider: AuthProviderComponent,
  initialRoute = '/'
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return function AuthContextTestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialRoute]}>
          <AuthProvider>{children}</AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

export function renderWithAuthProvider(
  AuthProvider: AuthProviderComponent,
  children: React.ReactNode,
  initialRoute = '/'
) {
  // This suite tests AuthProvider itself, so the project render helper (which
  // already supplies auth) would create a nested provider and mask lifecycle behavior.
  return render(<>{children}</>, {
    wrapper: createAuthWrapper(AuthProvider, initialRoute),
  });
}
