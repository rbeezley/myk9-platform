import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole, PERMISSIONS, MOCK_USERS } from '@/types/auth-types';
import {
  PermissionGuard,
  ExhibitorOnly,
  SecretaryOrAbove,
  ClubAdminOrAbove,
  SiteAdminOnly,
} from './PermissionGuard';

// Live component: components/auth/PermissionGuard.tsx (imported by
// RBACUtilityComponents, RegistrationWorkflow panels, CalendarPage,
// BrowseShowsPage, and hooks/usePermissionGuard.tsx — see grep evidence
// in the task report). This suite extends the existing
// src/test/rbac/rbac.test.tsx coverage (exhibitor-only) with a full
// role x guard decision table.

vi.mock('../../hooks/useAuthContext', () => ({
  useAuthContext: vi.fn(),
}));

import { useAuthContext } from '../../hooks/useAuthContext';

function mockAsRole(userKey: keyof typeof MOCK_USERS) {
  (useAuthContext as ReturnType<typeof vi.fn>).mockReturnValue({
    userWithRoles: MOCK_USERS[userKey],
    loading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * Decision table: role x <SecretaryOrAbove/ClubAdminOrAbove/SiteAdminOnly/ExhibitorOnly>
 * -> rendered ('content') or not ('fallback').
 * Derived directly from the role arrays passed to PermissionGuard in
 * components/auth/PermissionGuard.tsx's exported convenience guards.
 */
describe('PermissionGuard role-based convenience guards', () => {
  it.each<[keyof typeof MOCK_USERS, boolean]>([
    ['exhibitor-user', true],
    ['secretary-user', false],
    ['club-admin-user', false],
    ['site-admin-user', false],
    ['judge-user', false],
  ])('ExhibitorOnly: %s -> rendered=%s', (userKey, expected) => {
    mockAsRole(userKey);
    render(
      <ExhibitorOnly>
        <div data-testid="content">content</div>
      </ExhibitorOnly>
    );
    if (expected) {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    }
  });

  it.each<[keyof typeof MOCK_USERS, boolean]>([
    ['exhibitor-user', false],
    ['secretary-user', true],
    ['club-admin-user', true],
    ['site-admin-user', true],
    ['judge-user', false],
  ])('SecretaryOrAbove: %s -> rendered=%s', (userKey, expected) => {
    mockAsRole(userKey);
    render(
      <SecretaryOrAbove>
        <div data-testid="content">content</div>
      </SecretaryOrAbove>
    );
    if (expected) {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    }
  });

  it.each<[keyof typeof MOCK_USERS, boolean]>([
    ['exhibitor-user', false],
    ['secretary-user', false],
    ['club-admin-user', true],
    ['site-admin-user', true],
    ['judge-user', false],
  ])('ClubAdminOrAbove: %s -> rendered=%s', (userKey, expected) => {
    mockAsRole(userKey);
    render(
      <ClubAdminOrAbove>
        <div data-testid="content">content</div>
      </ClubAdminOrAbove>
    );
    if (expected) {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    }
  });

  it.each<[keyof typeof MOCK_USERS, boolean]>([
    ['exhibitor-user', false],
    ['secretary-user', false],
    ['club-admin-user', false],
    ['site-admin-user', true],
    ['judge-user', false],
  ])('SiteAdminOnly: %s -> rendered=%s', (userKey, expected) => {
    mockAsRole(userKey);
    render(
      <SiteAdminOnly>
        <div data-testid="content">content</div>
      </SiteAdminOnly>
    );
    if (expected) {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    }
  });
});

/**
 * Decision table: role x DEFAULT_ROLE_PERMISSIONS-backed permission check
 * on the raw PermissionGuard for a permission every role but exhibitor holds
 * (REGISTRATION_VIEW_ALL_DOGS) — exercises the `can()` path in
 * useRegistrationPermissions rather than the role path.
 */
describe('PermissionGuard permission-based checks across roles', () => {
  it.each<[keyof typeof MOCK_USERS, boolean]>([
    ['exhibitor-user', false],
    ['secretary-user', true],
    ['club-admin-user', true],
    ['site-admin-user', true],
    ['judge-user', false],
  ])('REGISTRATION_VIEW_ALL_DOGS: %s -> rendered=%s', (userKey, expected) => {
    mockAsRole(userKey);
    render(
      <PermissionGuard permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    if (expected) {
      expect(screen.getByTestId('content')).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    }
  });

  it('requireAll: permission AND role must both pass', () => {
    mockAsRole('secretary-user');
    render(
      <PermissionGuard
        permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}
        role={UserRole.SITE_ADMIN}
        requireAll
      >
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    // Secretary has the permission but not the SITE_ADMIN role -> requireAll fails
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('OR logic (default requireAll=false): permission OR role passing is enough', () => {
    mockAsRole('secretary-user');
    render(
      <PermissionGuard
        permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}
        role={UserRole.SITE_ADMIN}
      >
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    // Secretary lacks SITE_ADMIN role but has the permission -> OR passes
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('renderNothing suppresses fallback content on denial', () => {
    mockAsRole('exhibitor-user');
    const { container } = render(
      <PermissionGuard
        permission={PERMISSIONS.REGISTRATION_VIEW_ALL_DOGS}
        fallback={<div data-testid="fallback">no</div>}
        renderNothing
      >
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    expect(container).toBeEmptyDOMElement();
  });
});
