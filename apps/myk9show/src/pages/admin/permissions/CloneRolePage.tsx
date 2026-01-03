/**
 * Clone Role Page
 * Phase 4.2: Role cloning functionality
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Copy, 
  Save,
  Wand2,
  AlertTriangle,
  CheckCircle,
  Shield,
  Info
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { Permission, Role } from '@/types/rbac-types';
import { RolePermissionsEditor } from '@/components/admin/permissions/RolePermissionsEditor';

const CloneRolePage: React.FC = () => {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  
  const [sourceRole, setSourceRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: ''
  });
  
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRoleData = useCallback(async () => {
    if (!roleId) return;

    try {
      setIsLoading(true);
      setError(null);

      const [roleData, allPermissions, rolePermissions] = await Promise.all([
        rbacService.getRole(roleId),
        rbacService.getAllPermissions(),
        rbacService.getRolePermissions(roleId)
      ]);

      setSourceRole(roleData);
      setPermissions(allPermissions);
      setSelectedPermissions(rolePermissions.map(rp => rp.permission_id));
      
      // Pre-populate form with source role data
      setFormData({
        name: `${roleData.name}_copy`,
        displayName: `${roleData.display_name} (Copy)`,
        description: roleData.description ? 
          `Copy of ${roleData.display_name}: ${roleData.description}` :
          `Copy of ${roleData.display_name}`
      });
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

  const generateRoleName = () => {
    const cleanName = formData.displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    setFormData(prev => ({ ...prev, name: cleanName }));
  };

  const handlePermissionChange = (permissionId: string, granted: boolean) => {
    setSelectedPermissions(prev => 
      granted 
        ? [...prev, permissionId]
        : prev.filter(id => id !== permissionId)
    );
  };

  const validateForm = () => {
    if (!formData.name.trim()) {
      setError('Role name is required');
      return false;
    }
    
    if (!formData.displayName.trim()) {
      setError('Display name is required');
      return false;
    }

    if (selectedPermissions.length === 0) {
      setError('At least one permission must be selected');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setIsSaving(true);
      setError(null);

      const selectedPermissionNames = permissions
        .filter(p => selectedPermissions.includes(p.id))
        .map(p => p.name);

      await rbacService.createRole({
        name: formData.name,
        displayName: formData.displayName,
        description: formData.description,
        permissions: selectedPermissionNames
      });

      navigate('/admin/permissions/roles');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone role');
    } finally {
      setIsSaving(false);
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

  if (error && !sourceRole) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!sourceRole) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>Role not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const dummyRole: Role = {
    id: 'clone',
    name: formData.name || 'cloned_role',
    display_name: formData.displayName || 'Cloned Role',
    description: formData.description,
    is_system: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/permissions/roles">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Roles
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Copy className="h-8 w-8 text-primary" />
            Clone Role: {sourceRole.display_name}
          </h1>
          <p className="text-muted-foreground mt-1">
            Create a new role based on {sourceRole.display_name}
          </p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Source Role Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Source Role Information
          </CardTitle>
          <CardDescription>
            This new role will be based on the following role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Original Role</Label>
              <p className="font-medium">{sourceRole.display_name}</p>
              <p className="text-sm text-muted-foreground font-mono">{sourceRole.name}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Type</Label>
              <Badge variant={sourceRole.is_system ? "secondary" : "default"}>
                {sourceRole.is_system ? 'System Role' : 'Custom Role'}
              </Badge>
            </div>
            <div>
              <Label className="text-sm font-medium text-muted-foreground">Permissions</Label>
              <p className="font-medium">{selectedPermissions.length} permissions</p>
            </div>
            {sourceRole.description && (
              <div className="md:col-span-3">
                <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                <p className="text-sm">{sourceRole.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* New Role Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              New Role Details
            </CardTitle>
            <CardDescription>
              Configure the details for the cloned role
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="display-name">Display Name *</Label>
              <Input
                id="display-name"
                value={formData.displayName}
                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="e.g., Senior Secretary"
              />
            </div>

            <div>
              <Label htmlFor="role-name">Role Name *</Label>
              <div className="flex gap-2">
                <Input
                  id="role-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., senior_secretary"
                />
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={generateRoleName}
                  disabled={!formData.displayName}
                >
                  <Wand2 className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Used internally - lowercase letters, numbers, and underscores only
              </p>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this role is responsible for..."
                rows={4}
              />
            </div>

            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All permissions from the source role have been pre-selected. 
                You can modify them below before creating the role.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Permission Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Permission Summary</CardTitle>
            <CardDescription>
              Preview of permissions that will be assigned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Permissions:</span>
                <Badge variant="outline">{selectedPermissions.length}</Badge>
              </div>
              
              <Separator />
              
              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Sample Permissions
                </Label>
                <div className="mt-2 grid grid-cols-1 gap-1">
                  {permissions
                    .filter(p => selectedPermissions.includes(p.id))
                    .slice(0, 8)
                    .map(permission => (
                      <div key={permission.id} className="text-xs p-2 bg-muted rounded">
                        {permission.display_name}
                      </div>
                    ))}
                  {selectedPermissions.length > 8 && (
                    <div className="text-xs p-2 bg-muted/50 rounded text-center">
                      +{selectedPermissions.length - 8} more permissions
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Permission Editor */}
      <Card>
        <CardHeader>
          <CardTitle>Modify Permissions</CardTitle>
          <CardDescription>
            Adjust the permissions for the new role. All permissions from the source role are pre-selected.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RolePermissionsEditor
            role={dummyRole}
            permissions={permissions}
            grantedPermissionIds={selectedPermissions}
            onPermissionChange={handlePermissionChange}
          />
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" asChild>
          <Link to="/admin/permissions/roles">Cancel</Link>
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Cloning Role...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Create Cloned Role
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default CloneRolePage;