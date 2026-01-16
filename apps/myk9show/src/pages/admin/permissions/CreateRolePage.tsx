/**
 * Create Role Page
 * Phase 4.1: Custom roles creation interface
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  Plus, 
  Save,
  Wand2,
  AlertTriangle,
  CheckCircle,
  Shield,
  Sparkles
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { rbacService } from '@/services/rbac/RBACService';
import { Permission, Role } from '@/types/rbac-types';
import { RolePermissionsEditor } from '@/components/admin/permissions/RolePermissionsEditor';
import { PermissionTemplateSelector } from '@/components/admin/permissions/PermissionTemplateSelector';

const CreateRolePage: React.FC = () => {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    basedOnRole: '',
    template: ''
  });
  
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'basic' | 'permissions' | 'review'>('basic');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [permissionsData, rolesData] = await Promise.all([
        rbacService.getAllPermissions(),
        rbacService.getAllRoles()
      ]);
      setPermissions(permissionsData);
      setRoles(rolesData.filter(r => !r.is_system)); // Only show custom roles for cloning
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  const handleBasedOnRoleChange = async (roleId: string) => {
    if (!roleId) {
      setSelectedPermissions([]);
      return;
    }

    try {
      const rolePermissions = await rbacService.getRolePermissions(roleId);
      setSelectedPermissions(rolePermissions.map(rp => rp.permission_id));
      setFormData(prev => ({ ...prev, basedOnRole: roleId }));
    } catch {
      setError('Failed to load role permissions');
    }
  };

  const handleTemplateSelect = (template: { permissions: string[] }) => {
    const permissionIds = permissions
      .filter(p => template.permissions.includes(p.name))
      .map(p => p.id);
    setSelectedPermissions(permissionIds);
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

    // Check if role name already exists
    if (roles.some(r => r.name.toLowerCase() === formData.name.toLowerCase())) {
      setError('A role with this name already exists');
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
      setIsLoading(true);
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
      setError(err instanceof Error ? err.message : 'Failed to create role');
    } finally {
      setIsLoading(false);
    }
  };

  const generateRoleName = () => {
    const cleanName = formData.displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
    setFormData(prev => ({ ...prev, name: cleanName }));
  };

  const dummyRole: Role = {
    id: 'new',
    name: formData.name || 'new_role',
    display_name: formData.displayName || 'New Role',
    description: formData.description,
    is_system: false,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
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
            <Plus className="h-8 w-8 text-primary" />
            Create Custom Role
          </h1>
          <p className="text-muted-foreground mt-1">
            Design a custom role with specific permissions
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 ${
                step === 'basic' ? 'text-primary' : 'text-muted-foreground'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === 'basic' ? 'bg-primary text-white' : 'bg-muted'
                }`}>
                  1
                </div>
                <span className="font-medium">Basic Info</span>
              </div>
              <div className="w-8 h-px bg-border"></div>
              <div className={`flex items-center gap-2 ${
                step === 'permissions' ? 'text-primary' : 'text-muted-foreground'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === 'permissions' ? 'bg-primary text-white' : 'bg-muted'
                }`}>
                  2
                </div>
                <span className="font-medium">Permissions</span>
              </div>
              <div className="w-8 h-px bg-border"></div>
              <div className={`flex items-center gap-2 ${
                step === 'review' ? 'text-primary' : 'text-muted-foreground'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step === 'review' ? 'bg-primary text-white' : 'bg-muted'
                }`}>
                  3
                </div>
                <span className="font-medium">Review</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Basic Information */}
      {step === 'basic' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Role Details
              </CardTitle>
              <CardDescription>
                Basic information about the new role
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="display-name">Display Name *</Label>
                <Input
                  id="display-name"
                  value={formData.displayName}
                  onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="e.g., Event Coordinator"
                />
              </div>

              <div>
                <Label htmlFor="role-name">Role Name *</Label>
                <div className="flex gap-2">
                  <Input
                    id="role-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., event_coordinator"
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
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Quick Start Options
              </CardTitle>
              <CardDescription>
                Start with a template or clone an existing role
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Clone from Existing Role</Label>
                <Select onValueChange={handleBasedOnRoleChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role to clone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        <div className="flex items-center gap-2">
                          <span>{role.display_name}</span>
                          <Badge variant="outline" className="text-xs">
                            {role.permission_count || 0} permissions
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <PermissionTemplateSelector onTemplateSelect={handleTemplateSelect} />

              {selectedPermissions.length > 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    {selectedPermissions.length} permissions pre-selected from template/role
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 2: Permissions */}
      {step === 'permissions' && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Permissions</CardTitle>
            <CardDescription>
              Select the permissions for this role. You can always modify these later.
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
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review New Role</CardTitle>
              <CardDescription>
                Review the role configuration before creating
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Display Name</Label>
                  <p className="font-medium">{formData.displayName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-muted-foreground">Role Name</Label>
                  <p className="font-mono text-sm">{formData.name}</p>
                </div>
                {formData.description && (
                  <div className="md:col-span-2">
                    <Label className="text-sm font-medium text-muted-foreground">Description</Label>
                    <p className="text-sm">{formData.description}</p>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <Label className="text-sm font-medium text-muted-foreground">
                  Selected Permissions ({selectedPermissions.length})
                </Label>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {permissions
                    .filter(p => selectedPermissions.includes(p.id))
                    .slice(0, 12)
                    .map(permission => (
                      <Badge key={permission.id} variant="outline" className="text-xs">
                        {permission.display_name}
                      </Badge>
                    ))}
                  {selectedPermissions.length > 12 && (
                    <Badge variant="secondary" className="text-xs">
                      +{selectedPermissions.length - 12} more
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div>
          {step !== 'basic' && (
            <Button 
              variant="outline"
              onClick={() => {
                if (step === 'permissions') setStep('basic');
                if (step === 'review') setStep('permissions');
              }}
            >
              Previous
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/admin/permissions/roles">Cancel</Link>
          </Button>
          {step === 'basic' && (
            <Button 
              onClick={() => setStep('permissions')}
              disabled={!formData.name || !formData.displayName}
            >
              Next: Permissions
            </Button>
          )}
          {step === 'permissions' && (
            <Button onClick={() => setStep('review')}>
              Next: Review
            </Button>
          )}
          {step === 'review' && (
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Role
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateRolePage;