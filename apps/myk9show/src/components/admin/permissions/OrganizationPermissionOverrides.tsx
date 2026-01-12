/**
 * Organization Permission Overrides Component
 * Phase 4.4: Organization-specific permission overrides
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Switch component removed as not used in final implementation
// Label component not used in final implementation
import { logger } from '@/services/LoggingService';
import {
  Building2, 
  Shield, 
  Save, 
  RotateCcw,
  AlertTriangle,
  Info,
  Plus,
  Minus
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { Role, Permission } from '@/types/rbac-types';

interface OrganizationOverride {
  id: string;
  organization_id: string;
  organization_name: string;
  role_id: string;
  permission_id: string;
  override_type: 'grant' | 'deny' | 'remove';
  created_by: string;
  created_at: string;
  expires_at?: string;
}

interface OrganizationPermissionOverridesProps {
  organizationId: string;
  organizationName: string;
  onOverrideChange?: (overrides: OrganizationOverride[]) => void;
}

export const OrganizationPermissionOverrides: React.FC<OrganizationPermissionOverridesProps> = ({
  organizationId,
  organizationName,
  onOverrideChange
}) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [overrides, setOverrides] = useState<OrganizationOverride[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Map<string, 'grant' | 'deny' | 'remove'>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const [selectedRole] = useState<string>(''); // Commented out as not used

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [rolesData, permissionsData, overridesData] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
        loadOrganizationOverrides()
      ]);

      setRoles(rolesData);
      setPermissions(permissionsData);
      setOverrides(overridesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies needed as function doesn't use external values

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadOrganizationOverrides = async (): Promise<OrganizationOverride[]> => {
    // This would call a new endpoint to get organization-specific overrides
    // For now, returning empty array as this would need database implementation
    return [];
  };

  const getEffectivePermission = (roleId: string, permissionId: string): 'granted' | 'denied' | 'default' => {
    const overrideKey = `${roleId}-${permissionId}`;
    const pendingChange = pendingChanges.get(overrideKey);
    
    if (pendingChange) {
      return pendingChange === 'grant' ? 'granted' : pendingChange === 'deny' ? 'denied' : 'default';
    }

    const existingOverride = overrides.find(o => 
      o.role_id === roleId && o.permission_id === permissionId
    );

    if (existingOverride) {
      return existingOverride.override_type === 'grant' ? 'granted' : 
             existingOverride.override_type === 'deny' ? 'denied' : 'default';
    }

    return 'default';
  };

  const handlePermissionToggle = (roleId: string, permissionId: string, currentState: 'granted' | 'denied' | 'default') => {
    const overrideKey = `${roleId}-${permissionId}`;
    const newPendingChanges = new Map(pendingChanges);

    // Cycle through states: default → grant → deny → remove → default
    switch (currentState) {
      case 'default':
        newPendingChanges.set(overrideKey, 'grant');
        break;
      case 'granted':
        newPendingChanges.set(overrideKey, 'deny');
        break;
      case 'denied':
        newPendingChanges.set(overrideKey, 'remove');
        break;
    }

    setPendingChanges(newPendingChanges);
  };

  const handleSaveChanges = async () => {
    try {
      setIsSaving(true);
      setError(null);

      // This would call new endpoints to save organization overrides
      for (const [overrideKey, overrideType] of pendingChanges.entries()) {
        const [roleId, permissionId] = overrideKey.split('-');
        
        // Call API to create/update organization permission override
        logger.debug('Saving override:', 'admin', { data: {
          organizationId,
          roleId,
          permissionId,
          overrideType
        } });
      }

      // Clear pending changes
      setPendingChanges(new Map());
      
      // Reload data
      await loadData();
      
      if (onOverrideChange) {
        onOverrideChange(overrides);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetChanges = () => {
    setPendingChanges(new Map());
  };

  const getPermissionsByResource = () => {
    const grouped = permissions.reduce((acc, permission) => {
      if (!acc[permission.resource]) {
        acc[permission.resource] = [];
      }
      acc[permission.resource].push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);

    return grouped;
  };

  const getOverrideIcon = (state: 'granted' | 'denied' | 'default') => {
    switch (state) {
      case 'granted':
        return <Plus className="h-3 w-3 text-green-600" />;
      case 'denied':
        return <Minus className="h-3 w-3 text-red-600" />;
      default:
        return null;
    }
  };

  const getOverrideBadge = (state: 'granted' | 'denied' | 'default') => {
    switch (state) {
      case 'granted':
        return <Badge variant="default" className="bg-green-100 text-green-700">Override: Grant</Badge>;
      case 'denied':
        return <Badge variant="destructive" className="bg-red-100 text-red-700">Override: Deny</Badge>;
      default:
        return <Badge variant="outline">Default</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2 text-sm">Loading organization overrides...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const permissionsByResource = getPermissionsByResource();
  const hasChanges = pendingChanges.size > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Organization Permission Overrides
          </CardTitle>
          <CardDescription>
            Customize role permissions specifically for {organizationName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Overrides allow you to grant additional permissions or restrict permissions for roles within this organization. 
              These changes only affect users when they're operating within this organization's context.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Action Bar */}
      {hasChanges && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium">
                  You have {pendingChanges.size} pending override changes
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={handleResetChanges}
                  disabled={isSaving}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </Button>
                <Button 
                  size="sm"
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Overrides
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Override Configuration */}
      <Tabs defaultValue={roles[0]?.id || ''} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          {roles.slice(0, 4).map((role) => (
            <TabsTrigger key={role.id} value={role.id}>
              {role.display_name}
            </TabsTrigger>
          ))}
        </TabsList>

        {roles.map((role) => (
          <TabsContent key={role.id} value={role.id} className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {role.display_name} Overrides
                </CardTitle>
                <CardDescription>
                  Configure permission overrides for the {role.display_name} role within {organizationName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(permissionsByResource).map(([resource, resourcePermissions]) => (
                  <div key={resource} className="space-y-3">
                    <h4 className="font-medium text-sm uppercase tracking-wide text-muted-foreground">
                      {resource} Permissions
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                      {resourcePermissions.map((permission) => {
                        const effectiveState = getEffectivePermission(role.id, permission.id);
                        return (
                          <div
                            key={permission.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                            onClick={() => handlePermissionToggle(role.id, permission.id, effectiveState)}
                          >
                            <div className="flex items-center gap-3">
                              {getOverrideIcon(effectiveState)}
                              <div>
                                <div className="font-medium text-sm">{permission.display_name}</div>
                                <div className="text-xs text-muted-foreground font-mono">
                                  {permission.name}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {getOverrideBadge(effectiveState)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Override Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg text-green-600">
                {Array.from(pendingChanges.values()).filter(v => v === 'grant').length}
              </div>
              <div className="text-muted-foreground">Additional Grants</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg text-red-600">
                {Array.from(pendingChanges.values()).filter(v => v === 'deny').length}
              </div>
              <div className="text-muted-foreground">Permission Denials</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg text-gray-600">
                {Array.from(pendingChanges.values()).filter(v => v === 'remove').length}
              </div>
              <div className="text-muted-foreground">Removed Overrides</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg">
                {overrides.length}
              </div>
              <div className="text-muted-foreground">Active Overrides</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};