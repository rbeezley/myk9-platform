/**
 * User Role Management Page
 * Phase 3.4: Manage user role assignments with scoping
 * Created: December 2024
 */

import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@/services/LoggingService';
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
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { useUrlTab } from '@/hooks/useUrlTab';
import {
  Users,
  ArrowLeft,
  Plus,
  UserCheck,
  Calendar,
  AlertTriangle,
  Shield,
  MoreHorizontal,
  Trash2,
  ClipboardList,
} from 'lucide-react';
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
import { UserRole, Role } from '@/types/rbac-types';
import { UserRoleAssignmentDialog } from '@/components/admin/permissions/UserRoleAssignmentDialog';
import { notifications } from '@/lib/notifications';

const USER_ROLE_TAB_IDS = ['assignments', 'roles'] as const;

const USER_ROLE_TAB_DEFS: PrimaryTabDef[] = [
  { id: 'assignments', label: 'User Assignments', icon: UserCheck },
  { id: 'roles', label: 'Role Summary', icon: ClipboardList },
];

function makeColumns(
  onRevoke: (id: string, email: string, roleName: string) => void
): ColumnDef<UserRole, unknown>[] {
  return [
    {
      accessorKey: 'user_email',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.user_email || 'Unknown User'}</div>
          <div className="text-xs text-muted-foreground font-mono">{row.original.user_id}</div>
        </div>
      ),
    },
    {
      id: 'role',
      header: 'Role',
      accessorFn: row => row.role?.display_name ?? row.role?.name ?? '',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.role?.display_name || 'Unknown Role'}</div>
          <code className="text-xs bg-muted px-1 py-0.5 rounded">{row.original.role?.name}</code>
        </div>
      ),
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
          <DropdownMenuTrigger asChild>
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
                  row.original.user_email || 'Unknown User',
                  row.original.role?.display_name || 'Unknown Role'
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

const UserRoleManagementPage: React.FC = () => {
  const [activeTab, setTab] = useUrlTab(USER_ROLE_TAB_IDS, 'assignments');
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [pendingRevoke, setPendingRevoke] = useState<{
    id: string;
    email: string;
    roleName: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

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

  const handleAssignRole = async (assignment: {
    userId: string;
    roleId: string;
    scopeType?: string | undefined;
    scopeId?: string | undefined;
    expiresAt?: string | undefined;
  }) => {
    try {
      await rbacService.assignRole({
        userId: assignment.userId,
        roleId: assignment.roleId,
        ...(assignment.scopeType !== undefined && { scopeType: assignment.scopeType }),
        ...(assignment.scopeId !== undefined && { scopeId: assignment.scopeId }),
        ...(assignment.expiresAt !== undefined && { expiresAt: assignment.expiresAt }),
      });
      await loadData();
      setShowAssignDialog(false);
    } catch (err) {
      logger.error('Failed to assign role:', 'pages', {}, err as Error);
      throw err;
    }
  };

  const columns = useMemo(
    () => makeColumns((id, email, roleName) => setPendingRevoke({ id, email, roleName })),
    []
  );

  // Group by role for summary
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

  // Get active vs inactive counts
  const activeUserRoles = userRoles.filter(ur => ur.is_active).length;
  const inactiveUserRoles = userRoles.length - activeUserRoles;
  const uniqueUsers = new Set(userRoles.map(ur => ur.user_id)).size;

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading user roles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto pt-8 px-6 pb-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/permissions">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              User Role Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Assign and manage user roles across the system
            </p>
          </div>
        </div>
        <Button onClick={() => setShowAssignDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Assign Role
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-3xl font-bold">{uniqueUsers}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Assignments</p>
                <p className="text-3xl font-bold">{activeUserRoles}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Inactive Assignments</p>
                <p className="text-3xl font-bold">{inactiveUserRoles}</p>
              </div>
              <Calendar className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Available Roles</p>
                <p className="text-3xl font-bold">{roles.length}</p>
              </div>
              <Shield className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <PrimaryTabs
        tabs={USER_ROLE_TAB_DEFS}
        value={activeTab}
        onValueChange={setTab}
        className="space-y-4"
      >
        {/* User Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4">
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
        </TabsContent>

        {/* Role Summary Tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roleStats.map(({ role, totalAssignments, activeAssignments, inactiveAssignments }) => (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{role.display_name}</CardTitle>
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
        </TabsContent>
      </PrimaryTabs>

      {/* Revoke Confirmation Dialog */}
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

      {/* Assignment Dialog */}
      <UserRoleAssignmentDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        onAssign={handleAssignRole}
        roles={roles}
      />
    </div>
  );
};

export default UserRoleManagementPage;
