import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PermissionGuard, IfPermission, IfRole, IfAdmin } from './PermissionGuard';

// The one PermissionGuard (the former components/auth copy was deleted).

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: vi.fn(),
}));

import { useRBAC } from '@/hooks/useRBAC';

type MockRBACReturn = {
  hasPermission: (permission: string, scope?: { type: string; id: string }) => boolean;
  userRoles: Array<{ is_active: boolean; expires_at?: string | null; role?: { name?: string } }>;
  isLoading: boolean;
};

function mockRBAC(overrides: Partial<MockRBACReturn>) {
  const base: MockRBACReturn = {
    hasPermission: () => false,
    userRoles: [],
    isLoading: false,
  };
  (useRBAC as ReturnType<typeof vi.fn>).mockReturnValue({ ...base, ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PermissionGuard (rbac) — single permission', () => {
  it('renders children when hasPermission grants the single permission', async () => {
    mockRBAC({ hasPermission: perm => perm === 'show:create' });
    render(
      <PermissionGuard permission="show:create">
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
  });

  it('renders default denied message when permission is missing', async () => {
    mockRBAC({ hasPermission: () => false });
    render(
      <PermissionGuard permission="show:create">
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() =>
      expect(screen.getByText(/don't have permission to access this feature/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('renders custom fallback when provided and denied', async () => {
    mockRBAC({ hasPermission: () => false });
    render(
      <PermissionGuard permission="show:create" fallback={<div data-testid="fallback">nope</div>}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.getByTestId('fallback')).toBeInTheDocument());
  });

  it('renders nothing when showFallback=false and denied', async () => {
    mockRBAC({ hasPermission: () => false });
    const { container } = render(
      <PermissionGuard permission="show:create" showFallback={false}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(container.querySelector('[role="status"]')).not.toBeInTheDocument());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows loading state while rbac is loading', () => {
    mockRBAC({ isLoading: true });
    render(
      <PermissionGuard permission="show:create">
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    expect(screen.getByText(/checking permissions/i)).toBeInTheDocument();
  });

  it('calls onPermissionDenied when access is denied', async () => {
    const onDenied = vi.fn();
    mockRBAC({ hasPermission: () => false });
    render(
      <PermissionGuard permission="show:create" onPermissionDenied={onDenied}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
  });
});

describe('PermissionGuard (rbac) — requireAll / requireAny', () => {
  it('requireAll: grants only when every permission is held', async () => {
    mockRBAC({ hasPermission: perm => perm === 'a' || perm === 'b' });
    render(
      <PermissionGuard requireAll={['a', 'b']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
  });

  it('requireAll: denies when any one permission is missing', async () => {
    mockRBAC({ hasPermission: perm => perm === 'a' });
    render(
      <PermissionGuard requireAll={['a', 'b']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.queryByTestId('content')).not.toBeInTheDocument());
  });

  it('requireAny: grants when at least one permission is held', async () => {
    mockRBAC({ hasPermission: perm => perm === 'b' });
    render(
      <PermissionGuard requireAny={['a', 'b']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
  });

  it('requireAny: denies when none of the permissions are held', async () => {
    mockRBAC({ hasPermission: () => false });
    render(
      <PermissionGuard requireAny={['a', 'b']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.queryByTestId('content')).not.toBeInTheDocument());
  });
});

describe('PermissionGuard (rbac) — role-based checking', () => {
  it('grants access when the user holds one of the listed roles', async () => {
    mockRBAC({
      userRoles: [
        { is_active: true, role: { name: 'secretary' } },
        { is_active: true, role: { name: 'exhibitor' } },
      ],
    });
    render(
      <PermissionGuard roles={['secretary', 'club_admin']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.getByTestId('content')).toBeInTheDocument());
  });

  it('denies access when the matching role assignment is inactive', async () => {
    mockRBAC({
      userRoles: [{ is_active: false, role: { name: 'secretary' } }],
    });
    render(
      <PermissionGuard roles={['secretary']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.queryByTestId('content')).not.toBeInTheDocument());
  });

  it('denies access when the user holds none of the listed roles', async () => {
    mockRBAC({
      userRoles: [{ is_active: true, role: { name: 'exhibitor' } }],
    });
    render(
      <PermissionGuard roles={['secretary', 'club_admin']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    await waitFor(() => expect(screen.queryByTestId('content')).not.toBeInTheDocument());
  });
});

describe('IfPermission / IfRole / IfAdmin', () => {
  it('IfPermission renders children synchronously when permission is granted', () => {
    mockRBAC({ hasPermission: perm => perm === 'dog:read' });
    render(
      <IfPermission permission="dog:read">
        <div data-testid="content">content</div>
      </IfPermission>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('IfPermission renders fallback when permission is denied', () => {
    mockRBAC({ hasPermission: () => false });
    render(
      <IfPermission permission="dog:read" fallback={<div data-testid="fallback">no</div>}>
        <div data-testid="content">content</div>
      </IfPermission>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
  });

  it('IfRole accepts a single role string', () => {
    mockRBAC({ userRoles: [{ is_active: true, role: { name: 'judge' } }] });
    render(
      <IfRole roles="judge">
        <div data-testid="content">content</div>
      </IfRole>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('IfRole denies when role is not present among active roles', () => {
    mockRBAC({ userRoles: [{ is_active: true, role: { name: 'exhibitor' } }] });
    render(
      <IfRole roles={['judge', 'secretary']}>
        <div data-testid="content">content</div>
      </IfRole>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('IfAdmin is IfPermission("admin:manage") under the hood', () => {
    mockRBAC({ hasPermission: perm => perm === 'admin:manage' });
    render(
      <IfAdmin>
        <div data-testid="content">content</div>
      </IfAdmin>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('IfAdmin denies non-admins', () => {
    mockRBAC({ hasPermission: () => false });
    render(
      <IfAdmin>
        <div data-testid="content">content</div>
      </IfAdmin>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });
});

describe('PermissionGuard — checks combine with AND', () => {
  const content = <div data-testid="content">content</div>;

  it('denies when the permission passes but the role does not', () => {
    mockRBAC({
      hasPermission: () => true,
      userRoles: [{ is_active: true, role: { name: 'exhibitor' } }],
    });
    render(
      <PermissionGuard permission="x:y" roles={['secretary']} showFallback={false}>
        {content}
      </PermissionGuard>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it.each([
    ['roles', { roles: [] }],
    ['requireAny', { requireAny: [] }],
  ])('denies an explicitly empty %s list beside a passing permission', (_name, emptyList) => {
    mockRBAC({
      hasPermission: () => true,
      userRoles: [{ is_active: true, role: { name: 'secretary' } }],
    });
    render(
      <PermissionGuard permission="x:y" showFallback={false} {...emptyList}>
        {content}
      </PermissionGuard>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('denies when the role passes but the permission does not', () => {
    mockRBAC({
      hasPermission: () => false,
      userRoles: [{ is_active: true, role: { name: 'secretary' } }],
    });
    render(
      <PermissionGuard permission="x:y" roles={['secretary']} showFallback={false}>
        {content}
      </PermissionGuard>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('denies when requireAny passes but a later requireAll fails', () => {
    mockRBAC({ hasPermission: perm => perm === 'a' });
    render(
      <PermissionGuard requireAny={['a']} requireAll={['a', 'b']} showFallback={false}>
        {content}
      </PermissionGuard>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('grants when every supplied check passes', () => {
    mockRBAC({
      hasPermission: () => true,
      userRoles: [{ is_active: true, role: { name: 'secretary' } }],
    });
    render(
      <PermissionGuard permission="x:y" requireAny={['a']} roles={['secretary']}>
        {content}
      </PermissionGuard>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('denies when no check is supplied', () => {
    mockRBAC({ hasPermission: () => true });
    render(<PermissionGuard showFallback={false}>{content}</PermissionGuard>);
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('passes the scope to every permission check', () => {
    const hasPermission = vi.fn(() => true);
    mockRBAC({ hasPermission });
    const scope = { type: 'show', id: 's1' };
    render(
      <PermissionGuard permission="a" requireAll={['b']} requireAny={['c']} scope={scope}>
        {content}
      </PermissionGuard>
    );
    expect(hasPermission).toHaveBeenCalledWith('a', scope);
    expect(hasPermission).toHaveBeenCalledWith('b', scope);
    expect(hasPermission).toHaveBeenCalledWith('c', scope);
  });

  it('renders nothing while loading when showFallback is false', () => {
    mockRBAC({ isLoading: true });
    const { container } = render(
      <PermissionGuard permission="a" showFallback={false}>
        {content}
      </PermissionGuard>
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PermissionGuard — role expiry', () => {
  const day = 24 * 60 * 60 * 1000;

  it('denies a role whose expires_at is in the past', () => {
    mockRBAC({
      userRoles: [
        {
          is_active: true,
          expires_at: new Date(Date.now() - day).toISOString(),
          role: { name: 'secretary' },
        },
      ],
    });
    render(
      <PermissionGuard roles={['secretary']} showFallback={false}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });

  it('grants a role whose expires_at is in the future', () => {
    mockRBAC({
      userRoles: [
        {
          is_active: true,
          expires_at: new Date(Date.now() + day).toISOString(),
          role: { name: 'secretary' },
        },
      ],
    });
    render(
      <PermissionGuard roles={['secretary']}>
        <div data-testid="content">content</div>
      </PermissionGuard>
    );
    expect(screen.getByTestId('content')).toBeInTheDocument();
  });

  it('IfRole ignores an expired role', () => {
    mockRBAC({
      userRoles: [
        {
          is_active: true,
          expires_at: new Date(Date.now() - day).toISOString(),
          role: { name: 'judge' },
        },
      ],
    });
    render(
      <IfRole roles="judge">
        <div data-testid="content">content</div>
      </IfRole>
    );
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
  });
});
