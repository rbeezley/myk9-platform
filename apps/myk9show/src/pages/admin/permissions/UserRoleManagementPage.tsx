/**
 * User Role Management Page
 * Phase 3.4: Manage user role assignments with scoping
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { logger } from '@/services/LoggingService';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users, 
  ArrowLeft, 
  Search, 
  Plus,
  UserCheck,
  Calendar,
  AlertTriangle,
  Shield,
  MoreHorizontal,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { rbacService } from '@/services/rbac/RBACService';
import { UserRole, Role } from '@/types/rbac-types';
import { UserRoleAssignmentDialog } from '@/components/admin/permissions/UserRoleAssignmentDialog';

const UserRoleManagementPage: React.FC = () => {
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [_selectedUserRole, setSelectedUserRole] = useState<UserRole | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [userRolesData, rolesData] = await Promise.all([
        rbacService.getAllUserRoles(),
        rbacService.getAllRoles()
      ]);
      
      setUserRoles(userRolesData);
      setRoles(rolesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeRole = async (userRoleId: string, userEmail: string, roleName: string) => {
    if (!confirm(`Are you sure you want to revoke the "${roleName}" role from ${userEmail}?`)) {
      return;
    }

    try {
      await rbacService.revokeUserRole(userRoleId);
      await loadData(); // Reload data
    } catch (err) {
      alert(`Failed to revoke role: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        ...(assignment.expiresAt !== undefined && { expiresAt: assignment.expiresAt })
      });
      await loadData(); // Reload data
      setShowAssignDialog(false);
    } catch (err) {
      logger.error('Failed to assign role:', 'pages', {}, err as Error);
      throw err; // Let the dialog handle the error
    }
  };

  // Filter user roles based on search
  const filteredUserRoles = userRoles.filter(ur => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (ur.user_email || '').toLowerCase().includes(searchLower) ||
      (ur.role?.name || '').toLowerCase().includes(searchLower) ||
      (ur.role?.display_name || '').toLowerCase().includes(searchLower) ||
      (ur.scope_type || '').toLowerCase().includes(searchLower) ||
      (ur.scope_id || '').toLowerCase().includes(searchLower)
    );
  });

  // Group by role for summary
  const roleStats = roles.map(role => {
    const assignments = userRoles.filter(ur => ur.role_id === role.id);
    const activeAssignments = assignments.filter(ur => ur.is_active);
    return {
      role,
      totalAssignments: assignments.length,
      activeAssignments: activeAssignments.length,
      inactiveAssignments: assignments.length - activeAssignments.length
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
    <div className="container mx-auto pt-20 px-6 pb-6 max-w-7xl space-y-6">
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

      <Tabs defaultValue="assignments" className="space-y-4">
        <TabsList>
          <TabsTrigger value="assignments">User Assignments</TabsTrigger>
          <TabsTrigger value="roles">Role Summary</TabsTrigger>
        </TabsList>

        {/* User Assignments Tab */}
        <TabsContent value="assignments" className="space-y-4">
          {/* Search */}
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search by user email, role, or scope..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Assignments Table */}
          <Card>
            <CardHeader>
              <CardTitle>User Role Assignments</CardTitle>
              <CardDescription>
                {filteredUserRoles.length} of {userRoles.length} assignments shown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUserRoles.map((userRole) => (
                    <TableRow key={userRole.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {userRole.user_email || 'Unknown User'}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">
                            {userRole.user_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {userRole.role?.display_name || 'Unknown Role'}
                          </div>
                          <code className="text-xs bg-muted px-1 py-0.5 rounded">
                            {userRole.role?.name}
                          </code>
                        </div>
                      </TableCell>
                      <TableCell>
                        {userRole.scope_type && userRole.scope_id ? (
                          <Badge variant="outline">
                            {userRole.scope_type}: {userRole.scope_id}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Global</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={userRole.is_active ? "default" : "secondary"}>
                          {userRole.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(userRole.granted_at || '').toLocaleDateString()}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          by {userRole.assigned_by_email || 'System'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {userRole.expires_at ? (
                          <div className="text-sm">
                            {new Date(userRole.expires_at).toLocaleDateString()}
                          </div>
                        ) : (
                          <Badge variant="outline">Never</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedUserRole(userRole)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit Assignment
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleRevokeRole(
                                userRole.id, 
                                userRole.user_email || 'Unknown User',
                                userRole.role?.display_name || 'Unknown Role'
                              )}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Revoke Role
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {filteredUserRoles.length === 0 && (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No assignments found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm 
                      ? `No assignments match "${searchTerm}"`
                      : 'No role assignments have been made yet'
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Role Summary Tab */}
        <TabsContent value="roles" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roleStats.map(({ role, totalAssignments, activeAssignments, inactiveAssignments }) => (
              <Card key={role.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{role.display_name}</CardTitle>
                  <CardDescription>
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {role.name}
                    </code>
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
                    <p className="text-xs text-muted-foreground mt-3">
                      {role.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

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