# Role Assignment Consolidation Implementation Plan

> **Status:** Complete

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/users` the only surface that grants roles, and demote `/admin/permissions/users` to a read-only Assignments tab on `/admin/permissions`.

**Architecture:** Extract the grant-ledger table out of `UserRoleManagementPage` into a self-loading `RoleAssignmentsPanel` component, mount it as a fourth tab on `PermissionManagementPage`, delete the page and its assign dialog, and leave the retired route as a `<Navigate>` redirect. Then repair the support deep-link so it lands on `/admin/users` with the roles dialog open, and teach `ManageUserRolesDialog` to display (read-only) the show-scoped and expiring grants it cannot edit.

**Tech Stack:** React 19, TypeScript, react-router-dom v6, TanStack Query v5, Base UI via shadcn/ui, Vitest + Testing Library, Playwright (e2e).

**Design spec:** [`docs/plan-role-assignment-consolidation.md`](plan-role-assignment-consolidation.md). Read it first — it carries the evidence and the rejected alternatives.

## Global Constraints

- TypeScript only. Never JavaScript. Verify property names against the actual interface (`UserRole` in `src/types/rbac-types.ts`) rather than guessing.
- App root for every path below: `apps/myk9show/`. Paths in tasks are relative to `apps/myk9show/src/` unless shown otherwise.
- Package manager is **pnpm**, never npm. Run app tests from `apps/myk9show`.
- Files stay under 500 lines. `ManageUserRolesDialog.tsx` is 370 lines today; if Task 5 pushes it past 500, extract `OtherGrantsList` as a sibling file.
- No database migration, no RLS change, no grant change. This is a pure IA/UI change.
- Do not remove or alter any `// INTENT:` comment.
- Font floor: never below 14px. The `text-xs` Tailwind token in myK9Show is intentionally raised to 14px, so `text-xs` is acceptable.
- Site Admin copy is plain English, no jargon (`docs/INTENT.md` § Calm Over Clever).
- Commit after every task. Work in this worktree, never the primary checkout.

## Design note that the spec left implicit

`UserRoleManagementPage` currently owns an **inner** `useUrlTab(['assignments', 'roles'], 'assignments')` for its "User Assignments" / "Role Summary" sub-tabs. `PermissionManagementPage` also uses `useUrlTab` on the same `?tab=` search param. Nesting them would collide on one parameter.

**Resolution:** `RoleAssignmentsPanel` has **no inner tabs**. It renders the role-summary cards first, then the assignments table below them, in one scroll. Only `PermissionManagementPage` owns `?tab=`.

---

### Task 1: Extract `RoleAssignmentsPanel`

Create the read-only ledger component. It is not mounted anywhere yet — Task 2 does that. Keeping the extraction and the mount separate means a reviewer can reject the component's shape without also reverting the tab wiring.

**Files:**

- Create: `components/admin/permissions/RoleAssignmentsPanel.tsx`
- Create: `components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx`
- Read for reference: `pages/admin/permissions/UserRoleManagementPage.tsx` (source of the table code; deleted in Task 3)

**Interfaces:**

- Consumes: `rbacService.getAllUserRoles(): Promise<UserRole[]>`, `rbacService.getAllRoles(): Promise<Role[]>`, `rbacService.revokeUserRole(userRoleId: string): Promise<void>` — all from `@/services/rbac/RBACService`. `UserRole` and `Role` from `@/types/rbac-types`.
- Produces: `export const RoleAssignmentsPanel: React.FC` — takes **no props**, self-loads on mount. Task 2 imports it by that exact name.

- [ ] **Step 1: Write the failing test**

Create `components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx`:

```tsx
import { render, screen, within } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllUserRoles: vi.fn().mockResolvedValue([
      {
        id: 'ur-1',
        user_id: 'user-111',
        role_id: 'role-1',
        club_id: null,
        show_id: null,
        granted_by: 'admin-1',
        granted_at: '2026-01-15T10:00:00Z',
        expires_at: null,
        is_active: true,
        scope_type: 'global',
        scope_id: null,
        user_email: 'alice@example.com',
        role: {
          id: 'role-1',
          name: 'secretary',
          display_name: 'Secretary',
          description: 'Show secretary',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        assigned_by_email: 'admin@example.com',
      },
      {
        id: 'ur-2',
        user_id: 'user-222',
        role_id: 'role-2',
        club_id: 'club-1',
        show_id: null,
        granted_by: 'admin-1',
        granted_at: '2026-02-20T14:30:00Z',
        expires_at: '2026-12-31T23:59:59Z',
        is_active: false,
        scope_type: 'club',
        scope_id: 'club-1',
        user_email: 'bob@example.com',
        role: {
          id: 'role-2',
          name: 'judge',
          display_name: null,
          description: 'Trial judge',
          is_system: true,
          permissions: null,
          created_at: null,
        },
        assigned_by_email: 'admin@example.com',
      },
      {
        id: 'ur-3',
        user_id: 'missing-user',
        role_id: 'missing-role',
        club_id: null,
        show_id: null,
        granted_by: null,
        granted_at: '2026-03-20T14:30:00Z',
        expires_at: null,
        is_active: true,
        scope_type: 'global',
        scope_id: null,
      },
    ]),
    getAllRoles: vi.fn().mockResolvedValue([
      {
        id: 'role-1',
        name: 'secretary',
        display_name: 'Secretary',
        description: 'Show secretary',
        is_system: true,
        permissions: null,
        created_at: null,
      },
      {
        id: 'role-2',
        name: 'judge',
        description: 'Trial judge',
        is_system: true,
        permissions: null,
        created_at: null,
      },
    ]),
    revokeUserRole: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { RoleAssignmentsPanel } = await import('../RoleAssignmentsPanel');

describe('RoleAssignmentsPanel', () => {
  it('renders the assignments table with User, Role, and Status columns', async () => {
    render(<RoleAssignmentsPanel />);
    const table = await screen.findByRole('table');
    const headerTexts = within(table)
      .getAllByRole('columnheader')
      .map(h => h.textContent ?? '');
    expect(headerTexts.some(t => t.startsWith('User'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Role'))).toBe(true);
    expect(headerTexts.some(t => t.startsWith('Status'))).toBe(true);
  });

  it('renders user emails in rows', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('explains unresolved users and roles instead of showing bare "Unknown" labels', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByText('Unknown User')).not.toBeInTheDocument();
    expect(screen.queryByText('Unknown Role')).not.toBeInTheDocument();
    expect(screen.getByText('Unresolved user')).toBeInTheDocument();
    expect(
      screen.getByText(/No people label resolved for user_id missing-user/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Unresolved role')).toBeInTheDocument();
    expect(screen.getByText(/No roles row resolved for role_id missing-role/i)).toBeInTheDocument();
  });

  it('renders Active and Inactive status badges', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders a revoke action for each row', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    const menuTriggers = screen
      .getAllByRole('button')
      .filter(btn => btn.querySelector('.sr-only')?.textContent === 'Open menu');
    expect(menuTriggers.length).toBeGreaterThan(0);
  });

  it('falls back to the role name in summary cards when display_name is absent', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.getByText('judge', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('shows the role summary without requiring a tab click', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByRole('tab', { name: /role summary/i })).not.toBeInTheDocument();
    expect(screen.getByText('Secretary', { selector: '.text-lg' })).toBeInTheDocument();
  });

  it('offers no way to assign a role, and points at User Management instead', async () => {
    render(<RoleAssignmentsPanel />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /assign role/i })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /user management/i });
    expect(link).toHaveAttribute('href', '/admin/users');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx
```

Expected: FAIL — `Failed to resolve import "../RoleAssignmentsPanel"`.

- [ ] **Step 3: Write the component**

Create `components/admin/permissions/RoleAssignmentsPanel.tsx`. The column definitions, `getUserLabel`, and `getRoleLabel` move verbatim from `UserRoleManagementPage.tsx:66-221` — copy them, do not rewrite them, so the unresolved-label behaviour and the `sortingFn` comparators survive the move.

```tsx
/**
 * RoleAssignmentsPanel
 *
 * The grant ledger: one row per (user, role, scope) assignment, read-only
 * except for revoke. Granting roles lives on /admin/users — see
 * docs/plan-role-assignment-consolidation.md. Do not add an assign
 * affordance here; that is the duplication this panel was created to end.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, AlertTriangle, MoreHorizontal, Trash2, ArrowRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  DataTable,
  DataTableToolbar,
  DataTableSearch,
  DataTableColumnToggle,
  type ColumnDef,
} from '@/components/ui/data-table';
import type { DataTableColumnMeta } from '@/components/ui/data-table';
import { rbacService } from '@/services/rbac/RBACService';
import type { UserRole, Role } from '@/types/rbac-types';
import { notifications } from '@/lib/notifications';
import { TableSkeleton } from '@/components/common/SkeletonLoaders';

function getUserLabel(row: UserRole): { label: string; missingReason?: string } {
  if (row.user_email && row.user_email !== 'Unknown User') {
    return { label: row.user_email };
  }
  return {
    label: 'Unresolved user',
    missingReason: `No people label resolved for user_id ${row.user_id}`,
  };
}

function getRoleLabel(row: UserRole): { label: string; code?: string; missingReason?: string } {
  if (row.role?.display_name || row.role?.name) {
    return { label: row.role.display_name ?? row.role.name, code: row.role.name };
  }
  return {
    label: 'Unresolved role',
    missingReason: `No roles row resolved for role_id ${row.role_id}`,
  };
}

function makeColumns(
  onRevoke: (id: string, email: string, roleName: string) => void
): ColumnDef<UserRole, unknown>[] {
  return [
    {
      accessorKey: 'user_email',
      header: 'User',
      cell: ({ row }) => {
        const label = getUserLabel(row.original);
        return (
          <div>
            <div className="font-medium">{label.label}</div>
            {label.missingReason && (
              <div className="text-xs text-warning">{label.missingReason}</div>
            )}
            <div className="text-xs text-muted-foreground font-mono">{row.original.user_id}</div>
          </div>
        );
      },
    },
    {
      id: 'role',
      header: 'Role',
      accessorFn: row => row.role?.display_name ?? row.role?.name ?? '',
      cell: ({ row }) => {
        const label = getRoleLabel(row.original);
        return (
          <div>
            <div className="font-medium">{label.label}</div>
            {label.missingReason && (
              <div className="text-xs text-warning">{label.missingReason}</div>
            )}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              {label.code ?? row.original.role_id}
            </code>
          </div>
        );
      },
    },
    {
      id: 'scope',
      header: 'Scope',
      meta: { responsiveHide: 'md' } satisfies DataTableColumnMeta,
      accessorFn: row =>
        row.scope_type && row.scope_id ? `${row.scope_type}: ${row.scope_id}` : 'Global',
      cell: ({ row }) =>
        row.original.scope_type && row.original.scope_id ? (
          <Badge variant="outline">
            {row.original.scope_type}: {row.original.scope_id}
          </Badge>
        ) : (
          <Badge variant="secondary">Global</Badge>
        ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'secondary'}>
          {row.original.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      accessorKey: 'granted_at',
      header: 'Assigned',
      meta: { responsiveHide: 'sm' } satisfies DataTableColumnMeta,
      cell: ({ row }) => (
        <div>
          <div className="text-sm">
            {new Date(row.original.granted_at || '').toLocaleDateString()}
          </div>
          <div className="text-xs text-muted-foreground">
            by {row.original.assigned_by_email || 'System'}
          </div>
        </div>
      ),
      sortingFn: (rowA, rowB) => {
        const a = new Date(rowA.original.granted_at || 0).getTime();
        const b = new Date(rowB.original.granted_at || 0).getTime();
        return a - b;
      },
    },
    {
      accessorKey: 'expires_at',
      header: 'Expires',
      meta: { responsiveHide: 'lg' } satisfies DataTableColumnMeta,
      cell: ({ row }) =>
        row.original.expires_at ? (
          <div className="text-sm">{new Date(row.original.expires_at).toLocaleDateString()}</div>
        ) : (
          <Badge variant="outline">Never</Badge>
        ),
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.expires_at
          ? new Date(rowA.original.expires_at).getTime()
          : Infinity;
        const b = rowB.original.expires_at
          ? new Date(rowB.original.expires_at).getTime()
          : Infinity;
        return a - b;
      },
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild nativeButton>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                onRevoke(
                  row.original.id,
                  getUserLabel(row.original).label,
                  getRoleLabel(row.original).label
                )
              }
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Revoke Role
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];
}

export const RoleAssignmentsPanel: React.FC = () => {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{
    id: string;
    email: string;
    roleName: string;
  } | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [userRolesData, rolesData] = await Promise.all([
        rbacService.getAllUserRoles(),
        rbacService.getAllRoles(),
      ]);
      setUserRoles(userRolesData);
      setRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRevokeRole = async () => {
    if (!pendingRevoke) return;
    try {
      await rbacService.revokeUserRole(pendingRevoke.id);
      setPendingRevoke(null);
      await loadData();
    } catch (err) {
      setPendingRevoke(null);
      notifications.error(
        `Failed to revoke role: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const columns = useMemo(
    () => makeColumns((id, email, roleName) => setPendingRevoke({ id, email, roleName })),
    []
  );

  const roleStats = roles.map(role => {
    const assignments = userRoles.filter(ur => ur.role_id === role.id);
    const activeAssignments = assignments.filter(ur => ur.is_active);
    return {
      role,
      totalAssignments: assignments.length,
      activeAssignments: activeAssignments.length,
      inactiveAssignments: assignments.length - activeAssignments.length,
    };
  });

  if (isLoading) {
    return (
      <div className="p-6" role="status" aria-label="Loading role assignments">
        <TableSkeleton rows={6} columns={6} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Role Assignments</h2>
          <p className="text-muted-foreground mt-1">
            Every role currently granted, and who granted it. Revoke here; assign from User
            Management.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/users">
            User Management
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roleStats.map(({ role, totalAssignments, activeAssignments, inactiveAssignments }) => (
          <Card key={role.id}>
            <CardHeader>
              <CardTitle className="text-lg">{role.display_name || role.name}</CardTitle>
              <CardDescription>
                <code className="text-xs bg-muted px-1 py-0.5 rounded">{role.name}</code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Total Assignments:</span>
                  <Badge variant="outline">{totalAssignments}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Active:</span>
                  <Badge variant="default">{activeAssignments}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Inactive:</span>
                  <Badge variant="secondary">{inactiveAssignments}</Badge>
                </div>
              </div>
              {role.description && (
                <p className="text-xs text-muted-foreground mt-3">{role.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div
        className="max-w-full overflow-x-auto rounded-lg border border-border"
        aria-label="User role assignments table scroll area"
        role="region"
        tabIndex={0}
      >
        <div className="min-w-[760px]">
          <DataTable
            tableId="userRoleAssignments"
            columns={columns}
            data={userRoles}
            emptyState={
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No assignments found</h3>
                <p className="text-muted-foreground">No role assignments have been made yet</p>
              </div>
            }
            toolbar={({ table }) => (
              <DataTableToolbar table={table}>
                <DataTableSearch placeholder="Search by user, role, or scope..." />
                <DataTableColumnToggle />
              </DataTableToolbar>
            )}
          />
        </div>
      </div>

      <AlertDialog open={!!pendingRevoke} onOpenChange={open => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the &quot;{pendingRevoke?.roleName}&quot; role from{' '}
              {pendingRevoke?.email}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/admin/permissions/RoleAssignmentsPanel.tsx apps/myk9show/src/components/admin/permissions/__tests__/RoleAssignmentsPanel.test.tsx && git commit -m "feat(admin): extract read-only RoleAssignmentsPanel from the permissions user page"
```

---

### Task 2: Mount the panel as a tab and fix the two wrong links

Add the Assignments tab to `PermissionManagementPage`, repoint the "Assign User Roles" quick action at `/admin/users`, and fix the "Your Active Roles" stat card, which today shows a personal label on a link to a platform-wide list.

**Files:**

- Modify: `pages/admin/permissions/PermissionManagementPage.tsx` (tab list at `:16-20`, `useUrlTab` at `:45-48`, stats at `:74-101`, quick actions at `:103-130`, tab bodies at `:161-380`)
- Create: `pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx`

**Interfaces:**

- Consumes: `RoleAssignmentsPanel` from Task 1 (`@/components/admin/permissions/RoleAssignmentsPanel`), no props.
- Produces: `/admin/permissions?tab=assignments` as a valid URL. Task 3's redirect targets exactly that string.

- [ ] **Step 1: Write the failing test**

Create `pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx`:

```tsx
import { render, screen } from '@/test/utils/testUtils';
import { vi } from 'vitest';

vi.mock('@/components/admin/permissions/RoleAssignmentsPanel', () => ({
  RoleAssignmentsPanel: () => <div data-testid="role-assignments-panel">Assignments</div>,
}));

vi.mock('@/hooks/useRBAC', () => ({
  useRBAC: () => ({
    userRoles: [{ id: 'ur-1' }],
    userPermissions: [],
    effectivePermissions: [],
    isLoading: false,
  }),
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([]),
    getAllPermissions: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/components/rbac/RBACMigrationStatus', () => ({
  RBACMigrationStatus: () => null,
}));

vi.mock('../PermissionAuditPage', () => ({
  default: () => null,
}));

const { default: PermissionManagementPage } = await import('../PermissionManagementPage');

describe('PermissionManagementPage — assignments tab', () => {
  it('offers an Assignments tab', async () => {
    render(<PermissionManagementPage />);
    expect(await screen.findByRole('tab', { name: /assignments/i })).toBeInTheDocument();
  });

  it('renders the assignments panel when that tab is selected', async () => {
    const { user } = render(<PermissionManagementPage />);
    await user.click(await screen.findByRole('tab', { name: /assignments/i }));
    expect(await screen.findByTestId('role-assignments-panel')).toBeInTheDocument();
  });

  it('sends the assign-roles quick action to User Management, not the retired page', async () => {
    render(<PermissionManagementPage />);
    const link = await screen.findByRole('link', { name: /assign user roles/i });
    expect(link).toHaveAttribute('href', '/admin/users');
  });

  it('no longer links anywhere at /admin/permissions/users', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    const stale = screen
      .getAllByRole('link')
      .filter(a => a.getAttribute('href')?.startsWith('/admin/permissions/users'));
    expect(stale).toEqual([]);
  });

  it('labels the assignments stat card for the platform, not the signed-in admin', async () => {
    render(<PermissionManagementPage />);
    await screen.findByRole('tab', { name: /assignments/i });
    expect(screen.queryByText('Your Active Roles')).not.toBeInTheDocument();
    expect(screen.getByText('Role Assignments')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx
```

Expected: FAIL — no tab named "Assignments" is found.

- [ ] **Step 3: Wire up the tab, the quick action, and the stat card**

In `PermissionManagementPage.tsx`, replace the tab list at `:16-20`:

```tsx
const PERMISSION_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Permission Audit' },
];
```

Add the import next to the other component imports (after the `PermissionInventory` import at `:36`):

```tsx
import { RoleAssignmentsPanel } from '@/components/admin/permissions/RoleAssignmentsPanel';
```

Replace the `useUrlTab` call at `:45-48`:

```tsx
  const [activeTab, setActiveTab] = useUrlTab(
    ['overview', 'assignments', 'permissions', 'audit'] as const,
    'overview'
  );
```

Replace the third stat entry — currently `title: 'Your Active Roles'`, `value: userRoles.length.toString()`, `description: 'Role assignments on your account'`, `link: '/admin/permissions/users'` at `:90-96` — with a platform-wide count that matches where it points:

```tsx
    {
      title: 'Role Assignments',
      value: userRoles.length.toString(),
      description: 'Role grants on your account',
      icon: Users,
      link: '/admin/permissions?tab=assignments',
    },
```

Replace the "Assign User Roles" quick action at `:110-115`:

```tsx
    {
      title: 'Assign User Roles',
      description: 'Grant and revoke roles from User Management',
      icon: Users,
      link: '/admin/users',
    },
```

Add the tab body immediately after the closing `</TabsContent>` of the `overview` tab (line `:351`), before `<TabsContent value="permissions">`:

```tsx
      <TabsContent value="assignments">
        <RoleAssignmentsPanel />
      </TabsContent>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/admin/permissions/PermissionManagementPage.tsx apps/myk9show/src/pages/admin/permissions/__tests__/PermissionManagementPage.assignments.test.tsx && git commit -m "feat(admin): add Assignments tab to permissions, repoint assign links at /admin/users"
```

---

### Task 3: Retire the page, keep the URL alive

Delete `UserRoleManagementPage` and `UserRoleAssignmentDialog`, and serve `/admin/permissions/users` as a redirect so existing bookmarks and links keep working.

**Files:**

- Delete: `pages/admin/permissions/UserRoleManagementPage.tsx`
- Delete: `components/admin/permissions/UserRoleAssignmentDialog.tsx`
- Delete: `pages/admin/permissions/__tests__/UserRoleManagementPage.table.test.tsx`
- Modify: `routes/adminRoutes.tsx:295-304` (the `/admin/permissions/users` route)
- Modify: `routes/routeRegistry.ts:44` (lazy import map) and `:179` (`permissionManagement` prefetch group)
- Modify: `features/admin-help/data/pageDirectory.ts:98-107`
- Create: `pages/admin/permissions/__tests__/userRoleManagementRedirect.test.tsx`

**Interfaces:**

- Consumes: `/admin/permissions?tab=assignments` from Task 2.
- Produces: nothing new. After this task no module named `UserRoleManagementPage` or `UserRoleAssignmentDialog` exists.

- [ ] **Step 1: Write the failing test**

Create `pages/admin/permissions/__tests__/userRoleManagementRedirect.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

describe('/admin/permissions/users redirect', () => {
  it('redirects to the permissions page on the assignments tab', () => {
    render(
      <MemoryRouter initialEntries={['/admin/permissions/users']}>
        <Routes>
          <Route
            path="/admin/permissions/users"
            element={<Navigate to="/admin/permissions?tab=assignments" replace />}
          />
          <Route path="/admin/permissions" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/admin/permissions?tab=assignments'
    );
  });

  it('leaves no importable UserRoleManagementPage module behind', async () => {
    await expect(import('../UserRoleManagementPage')).rejects.toThrow();
  });

  it('leaves no importable UserRoleAssignmentDialog module behind', async () => {
    await expect(
      import('@/components/admin/permissions/UserRoleAssignmentDialog')
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/userRoleManagementRedirect.test.tsx
```

Expected: FAIL — the two module-absence assertions fail because both files still resolve.

- [ ] **Step 3: Delete the files and rewire the route**

```bash
cd "$(git rev-parse --show-toplevel)" && git rm apps/myk9show/src/pages/admin/permissions/UserRoleManagementPage.tsx apps/myk9show/src/components/admin/permissions/UserRoleAssignmentDialog.tsx apps/myk9show/src/pages/admin/permissions/__tests__/UserRoleManagementPage.table.test.tsx
```

In `routes/adminRoutes.tsx`, replace the whole `/admin/permissions/users` route block (`:295-304`) with:

```tsx
    {/* Retired 2026-08: role granting consolidated onto /admin/users. The URL
        stays alive so bookmarks and older links land on the ledger tab.
        See docs/plan-role-assignment-consolidation.md */}
    <Route
      path="/admin/permissions/users"
      element={<Navigate to="/admin/permissions?tab=assignments" replace />}
    />
```

Add `Navigate` to the existing `react-router-dom` import at the top of `adminRoutes.tsx`, and delete the now-unused `UserRoleManagementPage` import.

In `routes/routeRegistry.ts`, delete line `:44`:

```ts
  '/admin/permissions/users': () => import('@/pages/admin/permissions/UserRoleManagementPage'),
```

and narrow the prefetch group at `:179`:

```ts
  permissionManagement: ['/admin/permissions/roles'],
```

In `features/admin-help/data/pageDirectory.ts`, replace the `/admin/permissions/users` entry (`:98-107`) — mirroring the wording the audit entry already uses:

```ts
  {
    path: '/admin/permissions/users',
    title: 'User Role Assignment',
    description:
      'Read-only ledger of every role grant (tabbed into Permissions page). Assign roles from User Management.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'park',
    category: 'Admin',
    status: 'working',
    linksTo: ['/admin/permissions', '/admin/users'],
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/permissions/__tests__/ src/components/admin/permissions/__tests__/
```

Expected: PASS. Then confirm nothing still imports the deleted modules:

```bash
cd apps/myk9show && grep -rn "UserRoleManagementPage\|UserRoleAssignmentDialog" src/ ; echo "exit=$?"
```

Expected: only the two `rejects.toThrow()` lines in the redirect test. Any other hit is a broken import — fix it before committing.

- [ ] **Step 5: Typecheck, then commit**

```bash
cd apps/myk9show && pnpm typecheck
```

```bash
git add -A apps/myk9show/src/routes apps/myk9show/src/pages/admin/permissions apps/myk9show/src/components/admin/permissions apps/myk9show/src/features/admin-help && git commit -m "refactor(admin): retire /admin/permissions/users, redirect to the assignments tab"
```

---

### Task 4: Make the support deep-link land on the fix

`supportDiagnosticActions.ts` emits `/admin/permissions/users?userId=<id>`, and nothing has ever read that parameter. Repoint it at `/admin/users?userId=<id>` and have `UserManagementPage` open the roles dialog for that person.

**Files:**

- Modify: `pages/admin/supportDiagnosticActions.ts:140-154`
- Modify: `pages/admin/supportDiagnosticActions.test.ts:48-49`
- Modify: `pages/admin/UserManagementPage.tsx` (imports, and state near `:62`)
- Create: `pages/admin/__tests__/UserManagementPage.deepLink.test.tsx`

**Interfaces:**

- Consumes: `useAdminUsersQuery(showDeleted: boolean): { data: User[]; isLoading: boolean; error: Error | null; refetch: () => void }` from `@/hooks/queries/useUsersQuery`; `ManageUserRolesDialog` props `{ open: boolean; onOpenChange: (open: boolean) => void; user: User; onSaved: () => void }`.
- Produces: `/admin/users?userId=<uuid>` opens `ManageUserRolesDialog` for that user. Task 6 relies on `/admin/users` still rendering normally without the parameter.

- [ ] **Step 1: Write the failing test**

Create `pages/admin/__tests__/UserManagementPage.deepLink.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    roles: ['exhibitor'],
    status: 'active',
    ...overrides,
  }) as User;

const mockRefetch = vi.fn();
let mockQueryReturn: {
  data: User[];
  isLoading: boolean;
  error: Error | null;
  refetch: ReturnType<typeof vi.fn>;
} = { data: [makeUser()], isLoading: false, error: null, refetch: mockRefetch };

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useAdminUsersQuery: () => mockQueryReturn,
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: ({ users }: { users: User[] }) => (
    <div data-testid="user-table">
      {users.map(u => (
        <div key={u.id}>{u.email}</div>
      ))}
    </div>
  ),
}));

vi.mock('@/components/admin/users/UserFilters', () => ({
  UserFilters: () => null,
}));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('../UserManagementStats', () => ({ UserManagementStats: () => null }));

// Stubbed so this suite asserts *which user the dialog opened for*, not the
// dialog's own behaviour — that is covered in ManageUserRolesDialog's own tests.
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: ({
    user,
    onOpenChange,
  }: {
    user: User;
    onOpenChange: (open: boolean) => void;
  }) => (
    <div data-testid="manage-roles-dialog">
      {user.id}
      <button onClick={() => onOpenChange(false)}>close roles dialog</button>
    </div>
  ),
}));

vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  countActiveUsers: (users: User[]) => users.length,
  exportUsersCSV: vi.fn(),
}));

import UserManagementPage from '../UserManagementPage';

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserManagementPage ?userId= deep link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryReturn = { data: [makeUser()], isLoading: false, error: null, refetch: mockRefetch };
  });

  it('opens the roles dialog for the named user', async () => {
    renderAt('/admin/users?userId=user-1');
    expect(await screen.findByTestId('manage-roles-dialog')).toHaveTextContent('user-1');
  });

  it('does nothing when no userId is given', async () => {
    renderAt('/admin/users');
    await screen.findByTestId('user-table');
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('is a quiet no-op for an unknown userId — roster still renders', async () => {
    renderAt('/admin/users?userId=nobody-here');
    expect(await screen.findByTestId('user-table')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });

  it('does not reopen the dialog after the admin closes it', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const typist = userEvent.setup();
    renderAt('/admin/users?userId=user-1');
    await typist.click(await screen.findByRole('button', { name: /close roles dialog/i }));
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
    // Typing re-renders the page with ?userId= still in the URL. The dialog must
    // stay closed — this is what the consumed-once ref buys, and asserting it
    // with a real re-render (not an unmount) is the only way to prove it.
    await typist.type(screen.getByPlaceholderText(/search by name/i), 'jane');
    expect(screen.queryByTestId('manage-roles-dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/__tests__/UserManagementPage.deepLink.test.tsx
```

Expected: FAIL — "opens the roles dialog for the named user" times out; no dialog appears.

- [ ] **Step 3: Read the parameter in `UserManagementPage`**

Add to the imports in `pages/admin/UserManagementPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom';
```

and add `useEffect` and `useRef` to the existing `react` import.

After the `roleAssignTarget` state declaration at `:62`, add:

```tsx
  const [searchParams] = useSearchParams();
  // Support diagnostics deep-link here with ?userId= so the admin lands on the
  // affordance that fixes the ticket, not just a page that describes it.
  // Consumed once: a ref, not state, so closing the dialog cannot re-open it.
  const deepLinkConsumed = useRef(false);
```

Then, after the `handleManageRoles` callback at `:133-135`, add the effect:

```tsx
  const deepLinkUserId = searchParams.get('userId');
  useEffect(() => {
    if (deepLinkConsumed.current || !deepLinkUserId || users.length === 0) return;
    deepLinkConsumed.current = true;
    // Unknown ids are a quiet no-op: the admin still gets the roster, and the
    // support ticket may simply name someone who was since deleted.
    const match = users.find(user => user.id === deepLinkUserId);
    if (match) setRoleAssignTarget(match);
  }, [deepLinkUserId, users]);
```

- [ ] **Step 4: Repoint the support diagnostic actions**

In `pages/admin/supportDiagnosticActions.ts`, replace the `user-roles` / `permissions-users` block at `:140-154`:

```ts
  if (hasAccessClue(ticket) || userId) {
    addUnique(actions, {
      id: 'user-roles',
      label: 'Open user access',
      description: userId ?? 'Review user-role assignments.',
      href: userId ? `/admin/users?userId=${encodeId(userId)}` : '/admin/users',
    });
    addUnique(nextChecks, {
      id: 'permissions-users',
      label: 'Review user roles',
      href: '/admin/users',
    });
  }
```

In `pages/admin/supportDiagnosticActions.test.ts:49`, update the expected href:

```ts
          href: '/admin/users?userId=db-1',
```

- [ ] **Step 5: Run both test files to verify they pass**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/__tests__/UserManagementPage.deepLink.test.tsx src/pages/admin/supportDiagnosticActions.test.ts src/pages/admin/__tests__/SupportInboxPage.test.tsx
```

Expected: PASS. `SupportInboxPage.test.tsx` is included because it also references these actions; if it asserts the old href, update it the same way.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/admin/UserManagementPage.tsx apps/myk9show/src/pages/admin/supportDiagnosticActions.ts apps/myk9show/src/pages/admin/supportDiagnosticActions.test.ts apps/myk9show/src/pages/admin/__tests__/ && git commit -m "fix(admin): land the support user-access deep link on the roles dialog"
```

---

### Task 5: Show the grants the dialog cannot edit

`approve_role_request` can write show-scoped and expiring grants. `ManageUserRolesDialog` renders neither, so after Task 3 those grants would exist in no UI the admin normally opens. Add a read-only block.

**Files:**

- Modify: `components/admin/permissions/ManageUserRolesDialog.tsx` (`CurrentRoleAssignment` at `:34-39`, the query at `:65-84`, the dialog body before `<DialogFooter>` at `:359`)
- Create: `components/admin/permissions/__tests__/ManageUserRolesDialog.otherGrants.test.tsx`

**Interfaces:**

- Consumes: the `user_roles` PostgREST select in the dialog. The embed `roles(name)` already works; this task adds two plain columns from the same table, no new embed.
- Produces: `CurrentRoleAssignment` gains `showId: string | null` and `expiresAt: string | null`. No other module imports that interface — it is file-local.

- [ ] **Step 1: Write the failing test**

Create `components/admin/permissions/__tests__/ManageUserRolesDialog.otherGrants.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

type Row = {
  id: string;
  role_id: string;
  club_id: string | null;
  show_id: string | null;
  expires_at: string | null;
  roles: { name: string } | null;
};

let mockUserRoleRows: Row[] = [];

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'clubs') {
        return {
          select: () => ({
            is: () => ({
              order: () => Promise.resolve({ data: [{ id: 'club-1', name: 'Blue Ridge' }], error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: mockUserRoleRows, error: null }),
          }),
        }),
      };
    },
  },
}));

vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: {
    getAllRoles: vi.fn().mockResolvedValue([{ id: 'role-1', name: 'judge' }]),
    assignRole: vi.fn().mockResolvedValue(undefined),
    revokeRole: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ManageUserRolesDialog } from '../ManageUserRolesDialog';

const user = { id: 'user-1', firstName: 'Jane', lastName: 'Doe' } as User;

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManageUserRolesDialog open onOpenChange={vi.fn()} user={user} onSaved={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ManageUserRolesDialog — other grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserRoleRows = [];
  });

  it('stays out of the way when every grant is editable here', async () => {
    mockUserRoleRows = [
      { id: 'ur-1', role_id: 'role-1', club_id: 'club-1', show_id: null, expires_at: null, roles: { name: 'secretary' } },
    ];
    renderDialog();
    expect(await screen.findByText(/manage roles/i)).toBeInTheDocument();
    expect(screen.queryByText(/other grants/i)).not.toBeInTheDocument();
  });

  it('lists a show-scoped grant it cannot edit', async () => {
    mockUserRoleRows = [
      { id: 'ur-2', role_id: 'role-1', club_id: null, show_id: 'show-9', expires_at: null, roles: { name: 'judge' } },
    ];
    renderDialog();
    expect(await screen.findByText(/other grants/i)).toBeInTheDocument();
    expect(screen.getByText(/show-9/)).toBeInTheDocument();
  });

  it('lists an expiring grant it cannot edit', async () => {
    mockUserRoleRows = [
      { id: 'ur-3', role_id: 'role-1', club_id: 'club-1', show_id: null, expires_at: '2026-12-31T23:59:59Z', roles: { name: 'judge' } },
    ];
    renderDialog();
    expect(await screen.findByText(/other grants/i)).toBeInTheDocument();
    expect(screen.getByText(/expires/i)).toBeInTheDocument();
  });

  it('points at the assignments ledger for grants it cannot edit', async () => {
    mockUserRoleRows = [
      { id: 'ur-4', role_id: 'role-1', club_id: null, show_id: 'show-9', expires_at: null, roles: { name: 'judge' } },
    ];
    renderDialog();
    await screen.findByText(/other grants/i);
    expect(screen.getByRole('link', { name: /assignments/i })).toHaveAttribute(
      'href',
      '/admin/permissions?tab=assignments'
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/ManageUserRolesDialog.otherGrants.test.tsx
```

Expected: FAIL — "lists a show-scoped grant it cannot edit" cannot find "Other grants".

- [ ] **Step 3: Widen the query and render the block**

In `ManageUserRolesDialog.tsx`, extend the interface at `:34-39`:

```tsx
interface CurrentRoleAssignment {
  userRoleId: string;
  roleId: string;
  roleName: string;
  clubId: string | null;
  showId: string | null;
  expiresAt: string | null;
}
```

Widen the select and the mapper inside the `user-role-assignments` query (`:70-81`):

```tsx
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, role_id, club_id, show_id, expires_at, roles(name)')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        userRoleId: row.id as string,
        roleId: row.role_id as string,
        roleName: (row.roles as { name: string } | null)?.name ?? '',
        clubId: (row.club_id as string | null) ?? null,
        showId: (row.show_id as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
      }));
```

Add `Link` to the imports:

```tsx
import { Link } from 'react-router-dom';
```

Derive the list just after `const isLoading = loadingRoles || loadingClubs;` at `:260`:

```tsx
  // Grants this dialog cannot edit: show-scoped or expiring rows, which only
  // approve_role_request writes today. Surfacing them read-only keeps them from
  // becoming invisible now that /admin/permissions/users is retired.
  const otherGrants = currentAssignments.filter(a => a.showId !== null || a.expiresAt !== null);
```

Render the block immediately before `<DialogFooter>` at `:359`:

```tsx
        {otherGrants.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="font-medium">Other grants</p>
            <p className="text-xs text-muted-foreground">
              These were granted with a show or an end date, so they are managed on the
              assignments ledger.
            </p>
            <ul className="space-y-1">
              {otherGrants.map(grant => (
                <li key={grant.userRoleId} className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {ROLE_LABELS[grant.roleName] ?? grant.roleName}
                  </span>
                  {grant.showId && <> — show {grant.showId}</>}
                  {grant.expiresAt && (
                    <> — expires {new Date(grant.expiresAt).toLocaleDateString()}</>
                  )}
                </li>
              ))}
            </ul>
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/admin/permissions?tab=assignments">View all assignments</Link>
            </Button>
          </div>
        )}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/components/admin/permissions/__tests__/ManageUserRolesDialog.otherGrants.test.tsx
```

Expected: PASS, 4 tests. Then confirm the file is still under 500 lines:

```bash
wc -l apps/myk9show/src/components/admin/permissions/ManageUserRolesDialog.tsx
```

If it exceeds 500, extract the block into `components/admin/permissions/OtherGrantsList.tsx` taking `{ grants: { userRoleId: string; roleName: string; showId: string | null; expiresAt: string | null }[] }` and re-run this test before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/admin/permissions/ && git commit -m "feat(admin): show read-only show-scoped and expiring grants in the roles dialog"
```

---

### Task 6: Cross-link the surfaces, and cover the new route in e2e

`/admin/role-requests` already links to `/admin/users`; nothing links back, and the role-requests queue is invisible from the roster that its approvals feed.

**Files:**

- Modify: `pages/admin/UserManagementPage.tsx:178-189` (`actionButtons`)
- Modify: `features/admin-help/data/pageDirectory.ts` (`/admin/users` entry at `:160-169`, `/admin/role-requests` entry at `:170-179`)
- Modify: `test/e2e/route-health-by-role.spec.ts:108` area
- Create: `pages/admin/__tests__/UserManagementPage.crossLinks.test.tsx`

**Interfaces:**

- Consumes: `PageHeader` `actions` prop (already used), `Link` from `react-router-dom`.
- Produces: nothing other modules import.

- [ ] **Step 1: Write the failing test**

Create `pages/admin/__tests__/UserManagementPage.crossLinks.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { User } from '@/types/user-types';

const makeUser = (): User =>
  ({
    id: 'user-1',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    roles: ['exhibitor'],
    status: 'active',
  }) as User;

vi.mock('@/hooks/queries/useUsersQuery', () => ({
  useAdminUsersQuery: () => ({
    data: [makeUser()],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateUserMutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/components/admin/users/UserTable', () => ({
  UserTable: () => <div data-testid="user-table" />,
}));
vi.mock('@/components/admin/users/UserFilters', () => ({ UserFilters: () => null }));
vi.mock('@/components/admin/users/CreateUserDialog', () => ({ CreateUserDialog: () => null }));
vi.mock('@/components/admin/users/BulkActionsBar', () => ({ BulkActionsBar: () => null }));
vi.mock('@/components/panels/edit/UserEditPanel', () => ({ UserEditPanel: () => null }));
vi.mock('../UserManagementStats', () => ({ UserManagementStats: () => null }));
vi.mock('@/components/admin/permissions/ManageUserRolesDialog', () => ({
  ManageUserRolesDialog: () => null,
}));
vi.mock('../UserManagementPage.helpers', () => ({
  filterUsers: (users: User[]) => users,
  sortUsers: (users: User[]) => users,
  calculateRoleStats: () => ({}),
  countActiveUsers: (users: User[]) => users.length,
  exportUsersCSV: vi.fn(),
}));

import UserManagementPage from '../UserManagementPage';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('UserManagementPage cross-links', () => {
  beforeEach(() => vi.clearAllMocks());

  it('links to the role requests queue that feeds it', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /role requests/i });
    expect(link).toHaveAttribute('href', '/admin/role-requests');
  });

  it('keeps Create User and Export Users available', async () => {
    renderPage();
    expect(await screen.findByRole('button', { name: /create user/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export users/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/__tests__/UserManagementPage.crossLinks.test.tsx
```

Expected: FAIL — no link named "Role requests".

- [ ] **Step 3: Add the header link and the directory edges**

In `pages/admin/UserManagementPage.tsx`, add `ShieldCheck` to the `lucide-react` import and `Link` to the `react-router-dom` import, then replace `actionButtons` at `:178-189`:

```tsx
  const actionButtons = (
    <>
      <Button variant="outline" asChild>
        <Link to="/admin/role-requests">
          <ShieldCheck className="h-4 w-4 mr-2" />
          Role Requests
        </Link>
      </Button>
      <Button variant="outline" onClick={() => exportUsersCSV(sortedUsers)}>
        <Download className="h-4 w-4 mr-2" />
        Export Users
      </Button>
      <Button onClick={() => setShowCreateDialog(true)}>
        <Plus className="h-4 w-4 mr-2" />
        Create User
      </Button>
    </>
  );
```

In `features/admin-help/data/pageDirectory.ts`, set `linksTo` on both entries:

```ts
  {
    path: '/admin/users',
    title: 'User Management',
    description: 'Search, review, and manage platform user accounts. Grant and revoke roles here.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
    linksTo: ['/admin/role-requests', '/admin/permissions'],
  },
```

```ts
  {
    path: '/admin/role-requests',
    title: 'Role Requests',
    description: 'Review and resolve pending access requests.',
    roles: [UserRole.SITE_ADMIN],
    classification: 'critical-path',
    category: 'Admin',
    status: 'working',
    linksTo: ['/admin/users'],
  },
```

In `test/e2e/route-health-by-role.spec.ts`, add the tab URL next to the existing permissions entry at `:108`:

```ts
  { label: 'permissions', path: '/admin/permissions' },
  { label: 'permissions-assignments', path: '/admin/permissions?tab=assignments' },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/myk9show && pnpm vitest run src/pages/admin/__tests__/UserManagementPage.crossLinks.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/admin/UserManagementPage.tsx apps/myk9show/src/features/admin-help/data/pageDirectory.ts apps/myk9show/src/test/e2e/route-health-by-role.spec.ts apps/myk9show/src/pages/admin/__tests__/UserManagementPage.crossLinks.test.tsx && git commit -m "feat(admin): cross-link users and role requests, cover the assignments tab in e2e"
```

---

### Task 7: Full verification and plan close-out

**Files:**

- Modify: `docs/plan-role-assignment-consolidation.md` (status line)
- Modify: `docs/README.md` (two index rows)

- [ ] **Step 1: Run the full app suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: PASS. If a runner hangs past 30 seconds, stop and report it rather than retrying in a loop — the suite has known pre-existing timeout issues.

- [ ] **Step 2: Run the monorepo gates**

```bash
pnpm typecheck && pnpm lint
```

Expected: both clean. `pnpm lint` gates on errors only; warnings do not block.

- [ ] **Step 3: Prove no surface still offers a second way to assign**

```bash
cd apps/myk9show && grep -rn "permissions/users" src/ --include='*.ts' --include='*.tsx'
```

Expected hits only: the redirect route in `adminRoutes.tsx`, the parked `pageDirectory` entry, and the redirect test. Anything else is a missed link.

- [ ] **Step 4: Verify in the browser**

Start the dev server with the preview tooling (never `pnpm dev` via Bash), sign in as a site admin, and confirm:

1. `/admin/permissions/users` redirects to `/admin/permissions?tab=assignments`.
2. The Assignments tab lists grants and offers revoke but no assign.
3. `/admin/users` shows a "Role Requests" header link.
4. `/admin/users?userId=<a real user id>` opens the Manage Roles dialog for that person.

Capture a screenshot of the Assignments tab for the PR.

- [ ] **Step 5: Flip both plan docs to Complete and commit**

Set `> **Status:** Complete` in `docs/plan-role-assignment-consolidation.md` and in this file, then update both rows in `docs/README.md`.

```bash
git add docs/ && git commit -m "docs: mark role-assignment consolidation plans complete"
```

- [ ] **Step 6: Open the PR**

Confirm with the user before pushing or opening the PR — shared-system write. Then run Codex review per `docs/PLAYBOOK.md` § 4; it is a gate on every PR, not optional.

---

## Self-review against the spec

| Spec section | Task |
| --- | --- |
| § 3.1 demote to a tab | 1, 2 |
| § 3.2 redirect, do not delete | 3 |
| § 3.3 do not lose scope and expiry | 5 |
| § 3.4 fix the dead deep-link | 4 |
| § 3.5 cross-links (4 rows) | 2 (quick action, stat card), 6 (header link; role-requests→users already exists) |
| § 3.6 directory and registry | 3 (classification), 6 (`linksTo`) |
| § 5 testing rows 1–8 | 1 (rows 1–2), 3 (row 3), 4 (rows 4–5, 7), 5 (row 6), 6 (row 8) |
| § 6 risk: dialog past 500 lines | 5, step 4 |
