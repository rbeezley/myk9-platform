/**
 * Tests for /people and /users/:id routes and sidebar visibility.
 *
 * Covers:
 * - Route renders for secretary and site_admin
 * - Route shows fallback (access denied) for exhibitor
 * - Route redirects unauthenticated users to /sign-in
 * - Sidebar "People" link visibility per role
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, ProtectedRoute } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
import { buildUnifiedSidebarConfig } from '@/components/layout/sidebar/unifiedSidebarConfig';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getUserRoles: vi.fn().mockResolvedValue([]),
    getUserRolesByEmail: vi.fn().mockResolvedValue([]),
    hasPermission: vi.fn().mockResolvedValue(false),
  },
}));

const mockUseAuth = vi.fn();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuthReturn(options: { user?: object | null; loading?: boolean } = {}) {
  const { user = { id: 'test-id', email: 'test@example.com' }, loading = false } = options;
  return { user, loading, signIn: vi.fn(), signOut: vi.fn() };
}

function buildWrapper(initialPath: string): React.FC<{ children: React.ReactNode }> {
  return ({ children }) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return (
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

// Minimal pages used as route targets in test Routes
const PeoplePage = () => <div data-testid="people-page">Browse People</div>;
const PersonPage = () => <div data-testid="person-page">Person Detail</div>;
const SignInPage = () => <div data-testid="sign-in-page">Sign In</div>;

/**
 * Renders a mini router that mirrors the actual route definitions for /people
 * and /users/:id.
 */
function renderPeopleRoutes(initialPath: string, mockEmail: string | null = null) {
  if (mockEmail !== null) {
    mockUseAuth.mockReturnValue(makeAuthReturn({ user: { id: 'u1', email: mockEmail } }));
  } else {
    // Unauthenticated
    mockUseAuth.mockReturnValue(makeAuthReturn({ user: null }));
  }

  const Wrapper = buildWrapper(initialPath);

  return render(
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route
        path="/people"
        element={
          <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
            <PeoplePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users/:id"
        element={
          <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
            <PersonPage />
          </ProtectedRoute>
        }
      />
    </Routes>,
    { wrapper: Wrapper }
  );
}

// ---------------------------------------------------------------------------
// Mock users that map to MOCK_USERS in auth-types
// ---------------------------------------------------------------------------

// These emails are defined in MOCK_USERS in auth-types.ts
const SECRETARY_EMAIL = 'secretary@example.com';
const ADMIN_EMAIL = 'admin@example.com';
const EXHIBITOR_EMAIL = 'exhibitor@example.com';

// ---------------------------------------------------------------------------
// Route tests
// ---------------------------------------------------------------------------

describe('/people route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders for a secretary', () => {
    renderPeopleRoutes('/people', SECRETARY_EMAIL);
    expect(screen.getByTestId('people-page')).toBeInTheDocument();
  });

  it('renders for a site_admin', () => {
    renderPeopleRoutes('/people', ADMIN_EMAIL);
    expect(screen.getByTestId('people-page')).toBeInTheDocument();
  });

  it('shows access-denied fallback for an exhibitor', () => {
    renderPeopleRoutes('/people', EXHIBITOR_EMAIL);
    expect(screen.queryByTestId('people-page')).not.toBeInTheDocument();
    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /sign-in', () => {
    renderPeopleRoutes('/people', null);
    expect(screen.getByTestId('sign-in-page')).toBeInTheDocument();
    expect(screen.queryByTestId('people-page')).not.toBeInTheDocument();
  });
});

describe('/users/:id route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders for a secretary', () => {
    renderPeopleRoutes('/users/abc-123', SECRETARY_EMAIL);
    expect(screen.getByTestId('person-page')).toBeInTheDocument();
  });

  it('renders for a site_admin', () => {
    renderPeopleRoutes('/users/abc-123', ADMIN_EMAIL);
    expect(screen.getByTestId('person-page')).toBeInTheDocument();
  });

  it('shows access-denied fallback for an exhibitor', () => {
    renderPeopleRoutes('/users/abc-123', EXHIBITOR_EMAIL);
    expect(screen.queryByTestId('person-page')).not.toBeInTheDocument();
    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /sign-in', () => {
    renderPeopleRoutes('/users/abc-123', null);
    expect(screen.getByTestId('sign-in-page')).toBeInTheDocument();
    expect(screen.queryByTestId('person-page')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Sidebar tests (pure function — no DOM rendering needed)
// ---------------------------------------------------------------------------

describe('sidebar "People" link visibility', () => {
  it('appears in Browse section for secretary', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SECRETARY]);
    const browse = config.groups.find(g => g.title === 'Browse');
    expect(browse).toBeDefined();
    const people = browse!.items.find(i => i.href === '/people');
    expect(people).toBeDefined();
    expect(people!.title).toBe('People');
  });

  it('appears in Browse section for site_admin', () => {
    const config = buildUnifiedSidebarConfig([UserRole.SITE_ADMIN]);
    const browse = config.groups.find(g => g.title === 'Browse');
    expect(browse).toBeDefined();
    const people = browse!.items.find(i => i.href === '/people');
    expect(people).toBeDefined();
    expect(people!.title).toBe('People');
  });

  it('does NOT appear in sidebar for exhibitor-only users', () => {
    const config = buildUnifiedSidebarConfig([UserRole.EXHIBITOR]);
    const allHrefs = config.groups.flatMap(g => g.items.map(i => i.href));
    expect(allHrefs).not.toContain('/people');
  });
});
