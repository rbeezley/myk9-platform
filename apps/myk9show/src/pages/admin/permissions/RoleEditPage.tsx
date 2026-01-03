/**
 * Role Edit Page
 * Phase 3.2: Edit role permissions with visual permission grid
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
// useNavigate not used
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  ArrowLeft, 
  Shield, 
  Save, 
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Settings,
  Users,
  History,
  TreePine
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { Role, Permission, RolePermission } from '@/types/rbac-types';
import { RolePermissionsEditor } from '@/components/admin/permissions/RolePermissionsEditor';
import { PermissionGrid } from '@/components/admin/permissions/PermissionGrid';
// import { PermissionInheritanceView } from '@/components/admin/permissions/PermissionInheritanceView'; // Not used

const RoleEditPage: React.FC = () => {
  const { roleId } = useParams<{ roleId: string }>();
  // const navigate = useNavigate(); // Not used
  
  const [role, setRole] = useState<Role | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadRoleData = useCallback(async () => {
    if (!roleId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Load role details and permissions in parallel
      const [roleData, allPermissions, rolePerms] = await Promise.all([
        rbacService.getRole(roleId),
        rbacService.getAllPermissions(),
        rbacService.getRolePermissions(roleId)
      ]);

      setRole(roleData);
      setPermissions(allPermissions);
      // Transform the data to match RolePermission format
      const transformedRolePerms: RolePermission[] = rolePerms.map((rp, index) => ({
        id: `${roleId}-${rp.permission_id}-${index}`,
        role_id: roleId,
        permission_id: rp.permission_id,
        granted_at: new Date().toISOString()
      }));
      setRolePermissions(transformedRolePerms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load role data');
    } finally {
      setIsLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    if (roleId) {
      loadRoleData();
    }
  }, [roleId, loadRoleData]);

  const handlePermissionChange = (permissionId: string, granted: boolean) => {
    setHasUnsavedChanges(true);
    
    if (granted) {
      // Add permission if not already present
      if (!rolePermissions.find(rp => rp.permission_id === permissionId)) {
        const newRolePermission: RolePermission = {
          id: `temp-${Date.now()}`, // Temporary ID
          role_id: roleId!,
          permission_id: permissionId,
          granted_by: '', // Will be set by backend
          granted_at: new Date().toISOString()
        };
        setRolePermissions(prev => [...prev, newRolePermission]);
      }
    } else {
      // Remove permission
      setRolePermissions(prev => prev.filter(rp => rp.permission_id !== permissionId));
    }
  };

  const handleSaveChanges = async () => {
    if (!roleId || !role) return;

    try {
      setIsSaving(true);
      
      // Get current permission IDs
      const currentPermissionIds = rolePermissions.map(rp => rp.permission_id);
      
      // Update role permissions
      await rbacService.updateRolePermissions(roleId, currentPermissionIds);
      
      // Reload data to get updated state
      await loadRoleData();
      setHasUnsavedChanges(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetChanges = async () => {
    if (confirm('Are you sure you want to discard all unsaved changes?')) {
      await loadRoleData();
      setHasUnsavedChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading role data...</span>
        </div>
      </div>
    );
  }

  if (error && !role) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!role) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Role not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const grantedPermissionIds = rolePermissions.map(rp => rp.permission_id);

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/admin/permissions/roles">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Roles
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              {role.display_name}
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage permissions for the {role.display_name} role
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Button 
              variant="outline" 
              onClick={handleResetChanges}
              disabled={isSaving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          )}
          <Button 
            onClick={handleSaveChanges}
            disabled={!hasUnsavedChanges || isSaving}
          >
            {isSaving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Unsaved changes warning */}
      {hasUnsavedChanges && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Don't forget to save your changes before leaving this page.
          </AlertDescription>
        </Alert>
      )}

      {/* Error display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Role Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Role Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Role Name</label>
              <p className="font-mono text-sm bg-muted p-2 rounded mt-1">
                {role.name}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Display Name</label>
              <p className="text-sm p-2 mt-1">{role.display_name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Type</label>
              <div className="mt-1">
                <Badge variant={role.is_system ? "secondary" : "default"}>
                  {role.is_system ? 'System Role' : 'Custom Role'}
                </Badge>
              </div>
            </div>
            {role.description && (
              <div className="md:col-span-3">
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-sm p-2 mt-1">{role.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Permission Management Tabs */}
      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">Permission Editor</TabsTrigger>
          <TabsTrigger value="grid">Permission Grid</TabsTrigger>
          <TabsTrigger value="inheritance">Inheritance</TabsTrigger>
          <TabsTrigger value="summary">Summary</TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <RolePermissionsEditor
            role={role}
            permissions={permissions}
            grantedPermissionIds={grantedPermissionIds}
            onPermissionChange={handlePermissionChange}
          />
        </TabsContent>

        <TabsContent value="grid" className="space-y-4">
          <PermissionGrid
            roles={[role]}
            permissions={permissions}
            rolePermissions={rolePermissions}
            onPermissionChange={handlePermissionChange}
          />
        </TabsContent>

        <TabsContent value="inheritance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TreePine className="h-5 w-5" />
                Permission Inheritance Analysis
              </CardTitle>
              <CardDescription>
                Understand how this role's permissions would be inherited by users
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <TreePine className="h-4 w-4" />
                  <AlertDescription>
                    This view shows how permissions from this role would appear to users. 
                    Manage permissions (like "show:manage") automatically grant related CRUD permissions.
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="font-medium">Direct Permissions</h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {grantedPermissionIds.map(permId => {
                        const permission = permissions.find(p => p.id === permId);
                        if (!permission) return null;
                        return (
                          <div key={permId} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                            <Shield className="h-3 w-3 text-blue-600" />
                            <span className="text-sm">{permission.display_name}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Implied Permissions</h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {grantedPermissionIds
                        .map(permId => permissions.find(p => p.id === permId))
                        .filter(p => p?.action === 'manage')
                        .map(permission => {
                          if (!permission) return null;
                          const baseActions = ['create', 'read', 'update', 'delete'];
                          return baseActions.map(action => (
                            <div key={`${permission.id}-${action}`} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <TreePine className="h-3 w-3 text-gray-600" />
                              <span className="text-sm">{permission.resource}:{action}</span>
                              <Badge variant="outline" className="text-xs">implied</Badge>
                            </div>
                          ));
                        })}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Permission Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm">Total Permissions:</span>
                    <Badge variant="outline">{permissions.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Granted:</span>
                    <Badge variant="outline">{grantedPermissionIds.length}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Coverage:</span>
                    <Badge variant="outline">
                      {Math.round((grantedPermissionIds.length / permissions.length) * 100)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Changes</CardTitle>
              </CardHeader>
              <CardContent>
                {hasUnsavedChanges ? (
                  <div className="text-center py-4">
                    <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {hasUnsavedChanges ? 'You have unsaved changes' : 'No pending changes'}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">All changes saved</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Role Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Assigned Users:</span>
                    <Badge variant="outline">{role.user_count || 0}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last Modified:</span>
                  </div>
                  <p className="text-xs text-muted-foreground ml-6">
                    {new Date(role.updated_at || role.created_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RoleEditPage;