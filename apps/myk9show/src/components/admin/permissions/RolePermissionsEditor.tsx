/**
 * Role Permissions Editor Component
 * Phase 3.2: Visual editor for role permissions with grouping and search
 * Created: December 2024
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Search, 
  Shield, 
  CheckSquare, 
  Square,
  ChevronDown,
  ChevronRight,
  Info,
  Zap
} from 'lucide-react';
import { Role, Permission } from '@/types/rbac-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RolePermissionsEditorProps {
  role: Role;
  permissions: Permission[];
  grantedPermissionIds: string[];
  onPermissionChange: (permissionId: string, granted: boolean) => void;
}

export const RolePermissionsEditor: React.FC<RolePermissionsEditorProps> = ({
  role,
  permissions,
  grantedPermissionIds,
  onPermissionChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(['show', 'entry', 'dog']));

  // Helper to get resource/action from permission (from code or field)
  const getResource = (p: Permission) => p.resource || p.code?.split(':')[0] || 'other';
  const getAction = (p: Permission) => p.action || p.code?.split(':')[1] || '';
  const getDisplayName = (p: Permission) => p.display_name || p.name;

  // Group permissions by resource
  const permissionsByResource = useMemo(() => {
    const filtered = permissions.filter(permission =>
      permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getDisplayName(permission).toLowerCase().includes(searchTerm.toLowerCase()) ||
      permission.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      getResource(permission).toLowerCase().includes(searchTerm.toLowerCase())
    );

    const grouped = filtered.reduce((acc, permission) => {
      const resource = getResource(permission);
      if (!acc[resource]) {
        acc[resource] = [];
      }
      acc[resource].push(permission);
      return acc;
    }, {} as Record<string, Permission[]>);

    // Sort permissions within each resource group
    Object.keys(grouped).forEach(resource => {
      grouped[resource].sort((a, b) => {
        // Sort by action priority
        const actionOrder = ['read', 'create', 'update', 'delete', 'manage', 'admin'];
        const aIndex = actionOrder.indexOf(getAction(a));
        const bIndex = actionOrder.indexOf(getAction(b));

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        }

        return getAction(a).localeCompare(getAction(b));
      });
    });

    return grouped;
  }, [permissions, searchTerm]);

  // Permission inheritance rules
  const inheritanceRules = {
    'manage': ['create', 'read', 'update', 'delete'],
    'admin': ['create', 'read', 'update', 'delete', 'manage']
  };

  const toggleResourceExpansion = (resource: string) => {
    const newExpanded = new Set(expandedResources);
    if (newExpanded.has(resource)) {
      newExpanded.delete(resource);
    } else {
      newExpanded.add(resource);
    }
    setExpandedResources(newExpanded);
  };

  const isPermissionGranted = (permissionId: string) => {
    return grantedPermissionIds.includes(permissionId);
  };

  const isPermissionInherited = (permission: Permission) => {
    // Check if this permission is inherited from a higher-level permission
    const resource = getResource(permission);
    const action = getAction(permission);
    
    // Look for higher-level permissions that would grant this one
    for (const [parentAction, childActions] of Object.entries(inheritanceRules)) {
      if (childActions.includes(action)) {
        const parentPermission = permissions.find(p =>
          getResource(p) === resource && getAction(p) === parentAction
        );
        if (parentPermission && grantedPermissionIds.includes(parentPermission.id)) {
          return true;
        }
      }
    }
    
    return false;
  };

  const getResourceStats = (resource: string) => {
    const resourcePermissions = permissionsByResource[resource] || [];
    const granted = resourcePermissions.filter(p => 
      isPermissionGranted(p.id) || isPermissionInherited(p)
    ).length;
    
    return {
      total: resourcePermissions.length,
      granted,
      percentage: resourcePermissions.length > 0 ? Math.round((granted / resourcePermissions.length) * 100) : 0
    };
  };

  const handleSelectAllResource = (resource: string, grant: boolean) => {
    const resourcePermissions = permissionsByResource[resource] || [];
    resourcePermissions.forEach(permission => {
      if (grant !== isPermissionGranted(permission.id)) {
        onPermissionChange(permission.id, grant);
      }
    });
  };

  const totalStats = {
    total: permissions.length,
    granted: grantedPermissionIds.length,
    percentage: permissions.length > 0 ? Math.round((grantedPermissionIds.length / permissions.length) * 100) : 0
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Permission Editor for {role.display_name}
          </CardTitle>
          <CardDescription>
            Grant or revoke permissions for this role. Permissions with inheritance are automatically granted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-2xl">{totalStats.granted}</div>
              <div className="text-sm text-muted-foreground">Granted Permissions</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-2xl">{totalStats.total}</div>
              <div className="text-sm text-muted-foreground">Total Permissions</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-2xl">{totalStats.percentage}%</div>
              <div className="text-sm text-muted-foreground">Coverage</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search permissions by name, resource, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Permission Inheritance Info */}
      {role.is_system && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>System Role:</strong> This is a built-in role. Changes will affect all users with this role.
            Some permissions may be automatically inherited based on permission hierarchy.
          </AlertDescription>
        </Alert>
      )}

      {/* Permissions by Resource */}
      <div className="space-y-4">
        {Object.keys(permissionsByResource)
          .sort((a, b) => a.localeCompare(b))
          .map(resource => {
            const resourcePermissions = permissionsByResource[resource];
            const stats = getResourceStats(resource);
            const isExpanded = expandedResources.has(resource);
            const allGranted = stats.granted === stats.total;
            const someGranted = stats.granted > 0 && stats.granted < stats.total;

            return (
              <Card key={resource}>
                <Collapsible 
                  open={isExpanded} 
                  onOpenChange={() => toggleResourceExpansion(resource)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <div>
                            <CardTitle className="text-lg capitalize">
                              {resource} Permissions
                            </CardTitle>
                            <CardDescription>
                              {stats.granted} of {stats.total} permissions granted ({stats.percentage}%)
                            </CardDescription>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={allGranted ? "default" : someGranted ? "secondary" : "outline"}>
                            {stats.percentage}%
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAllResource(resource, !allGranted);
                            }}
                          >
                            {allGranted ? (
                              <>
                                <Square className="h-3 w-3 mr-1" />
                                Revoke All
                              </>
                            ) : (
                              <>
                                <CheckSquare className="h-3 w-3 mr-1" />
                                Grant All
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {resourcePermissions.map(permission => {
                          const isGranted = isPermissionGranted(permission.id);
                          const isInherited = isPermissionInherited(permission);
                          const isEffectivelyGranted = isGranted || isInherited;

                          return (
                            <div
                              key={permission.id}
                              className={`p-3 border rounded-lg hover:bg-muted/30 transition-colors ${
                                isEffectivelyGranted ? 'border-green-200 bg-green-50/50' : 'border-border'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={isGranted}
                                  disabled={isInherited}
                                  onCheckedChange={(checked) => 
                                    onPermissionChange(permission.id, !!checked)
                                  }
                                  className="mt-0.5"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">
                                      {getDisplayName(permission)}
                                    </span>
                                    {isInherited && (
                                      <Badge variant="secondary" className="text-xs">
                                        <Zap className="h-3 w-3 mr-1" />
                                        Inherited
                                      </Badge>
                                    )}
                                  </div>
                                  <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                    {permission.name}
                                  </code>
                                  {permission.description && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {permission.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
      </div>

      {/* Empty State */}
      {Object.keys(permissionsByResource).length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No permissions found</h3>
            <p className="text-muted-foreground">
              {searchTerm 
                ? `No permissions match your search term "${searchTerm}"`
                : 'No permissions available for this role'
              }
            </p>
            {searchTerm && (
              <Button variant="outline" onClick={() => setSearchTerm('')} className="mt-4">
                Clear Search
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};