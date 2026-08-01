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
