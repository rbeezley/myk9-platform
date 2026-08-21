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
    const unresolvedEmail = /^Unknown User \((.+)\)$/.exec(row.user_email);
    return { label: unresolvedEmail?.[1] ?? row.user_email };
  }
  return {
    label: 'Unresolved user',
    missingReason: 'This user could not be matched to a profile.',
  };
}

// The row's only real scope signal is show_id/club_id — scope_type/scope_id
// are virtual fields RoleManager.getAllUserRoles() never populates. Derive
// what we actually have so the badge matches live data instead of always
// reading "Global".
function getScopeLabel(row: UserRole): string {
  if (row.show_id) return 'Show';
  if (row.club_id) {
    return row.club?.name ? `Club: ${row.club.name}` : `Club: unresolved (${row.club_id})`;
  }
  return 'Global';
}

function getRoleLabel(row: UserRole): { label: string; missingReason?: string } {
  if (row.role?.display_name || row.role?.name) {
    const rawLabel = row.role.display_name ?? row.role.name;
    return {
      label: rawLabel.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
    };
  }
  return {
    label: 'Unresolved role',
    missingReason: 'This role could not be matched to a role definition.',
  };
}

function makeColumns(
  onRevoke: (id: string, email: string, roleName: string, scopeLabel: string) => void
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
          </div>
        );
      },
    },
    {
      id: 'scope',
      header: 'Scope',
      meta: { responsiveHide: 'md' } satisfies DataTableColumnMeta,
      accessorFn: row => getScopeLabel(row),
      cell: ({ row }) => {
        const scopeLabel = getScopeLabel(row.original);
        if (row.original.show_id) {
          return (
            <Link
              className="font-medium text-primary hover:underline"
              to={`/shows/${row.original.show_id}`}
            >
              {scopeLabel}
            </Link>
          );
        }
        if (row.original.club_id) {
          if (!row.original.club?.name) {
            return <span className="text-warning">{scopeLabel}</span>;
          }
          return (
            <Link
              className="font-medium text-primary hover:underline"
              to={`/clubs/${row.original.club_id}`}
            >
              {scopeLabel}
            </Link>
          );
        }
        return <Badge variant="secondary">Global</Badge>;
      },
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
            <Button
              variant="ghost"
              className="h-11 w-11 p-0"
              aria-label={`Actions for ${getUserLabel(row.original).label}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() =>
                onRevoke(
                  row.original.id,
                  getUserLabel(row.original).label,
                  getRoleLabel(row.original).label,
                  getScopeLabel(row.original)
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
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{
    id: string;
    email: string;
    roleName: string;
    scopeLabel: string;
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
    } catch {
      setError("We couldn't load role assignments.");
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
      setIsRevoking(true);
      await rbacService.revokeUserRole(pendingRevoke.id);
      notifications.success(
        `Removed the ${pendingRevoke.roleName} role from ${pendingRevoke.email}.`
      );
      setPendingRevoke(null);
      await loadData();
    } catch {
      notifications.error("We couldn't revoke that role. Try again.");
    } finally {
      setIsRevoking(false);
    }
  };

  const columns = useMemo(
    () =>
      makeColumns((id, email, roleName, scopeLabel) =>
        setPendingRevoke({ id, email, roleName, scopeLabel })
      ),
    []
  );

  const activeAssignmentCount = userRoles.filter(assignment => assignment.is_active).length;
  const personCount = new Set(userRoles.map(assignment => assignment.user_id)).size;

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
        <Button asChild variant="outline" className="h-11">
          <Link to="/admin/users">
            Assign roles in User Management
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{error}</span>
            <Button variant="outline" className="h-11" onClick={() => void loadData()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
        <span className="font-medium">
          {activeAssignmentCount}{' '}
          {activeAssignmentCount === 1 ? 'active assignment' : 'active assignments'}
        </span>
        <span aria-hidden="true" className="text-border">
          •
        </span>
        <span className="text-muted-foreground">
          {personCount} {personCount === 1 ? 'person' : 'people'}
        </span>
        <span aria-hidden="true" className="text-border">
          •
        </span>
        <span className="text-muted-foreground">
          {roles.length} {roles.length === 1 ? 'role type' : 'role types'}
        </span>
      </div>

      <div>
        <DataTable
          tableId="userRoleAssignments"
          scrollAreaLabel="User role assignments table"
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

      <AlertDialog open={!!pendingRevoke} onOpenChange={open => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the &quot;{pendingRevoke?.roleName}&quot; role from{' '}
              {pendingRevoke?.email} for {pendingRevoke?.scopeLabel}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeRole}
              disabled={isRevoking}
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
