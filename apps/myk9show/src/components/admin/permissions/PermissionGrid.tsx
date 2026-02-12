/**
 * Permission Grid Component
 * Phase 3.3: Visual matrix of roles vs permissions for bulk management
 * Created: December 2024
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Grid, 
  Filter,
  ChevronDown,
  ChevronRight,
  Check,
  Minus,
  RotateCcw
} from 'lucide-react';
import { Role, Permission, RolePermission } from '@/types/rbac-types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PermissionGridProps {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
  onPermissionChange?: (permissionId: string, granted: boolean) => void;
  readOnly?: boolean;
}

export const PermissionGrid: React.FC<PermissionGridProps> = ({
  roles,
  permissions,
  rolePermissions,
  onPermissionChange,
  readOnly = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set(['show', 'entry']));

  // Helper to get resource from permission (from code or resource field)
  const getResource = (p: Permission) => p.resource || p.code?.split(':')[0] || 'other';
  const getAction = (p: Permission) => p.action || p.code?.split(':')[1] || '';
  const getDisplayName = (p: Permission) => p.display_name || p.name;

  // Get unique resources for filter
  const resources = useMemo(() => {
    const uniqueResources = [...new Set(permissions.map(p => getResource(p)))].sort();
    return uniqueResources;
  }, [permissions]);

  // Filter and group permissions
  const filteredPermissions = useMemo(() => {
    return permissions.filter(permission => {
      const matchesSearch = searchTerm === '' ||
        permission.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getDisplayName(permission).toLowerCase().includes(searchTerm.toLowerCase()) ||
        getResource(permission).toLowerCase().includes(searchTerm.toLowerCase());

      const matchesResource = resourceFilter === 'all' || getResource(permission) === resourceFilter;

      return matchesSearch && matchesResource;
    });
  }, [permissions, searchTerm, resourceFilter]);

  const permissionsByResource = useMemo(() => {
    const grouped = filteredPermissions.reduce((acc, permission) => {
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
  }, [filteredPermissions]);

  // Helper to check if a role has a permission
  const hasPermission = (roleId: string, permissionId: string) => {
    return rolePermissions.some(rp => 
      rp.role_id === roleId && rp.permission_id === permissionId
    );
  };

  // Helper to get role permission stats
  const getRoleStats = (roleId: string) => {
    const rolePerms = rolePermissions.filter(rp => rp.role_id === roleId);
    const grantedInFiltered = rolePerms.filter(rp => 
      filteredPermissions.some(p => p.id === rp.permission_id)
    ).length;
    
    return {
      total: filteredPermissions.length,
      granted: grantedInFiltered,
      percentage: filteredPermissions.length > 0 ? 
        Math.round((grantedInFiltered / filteredPermissions.length) * 100) : 0
    };
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

  const clearFilters = () => {
    setSearchTerm('');
    setResourceFilter('all');
  };

  if (roles.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Grid className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No roles to display</h3>
          <p className="text-muted-foreground">
            Add roles to see the permission grid
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Grid className="h-5 w-5" />
            Permission Grid
          </CardTitle>
          <CardDescription>
            Visual matrix showing which permissions are granted to each role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search permissions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={resourceFilter} onValueChange={setResourceFilter}>
              <SelectTrigger className="w-full md:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by resource" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Resources</SelectItem>
                {resources.map(resource => (
                  <SelectItem key={resource} value={resource}>
                    {resource.charAt(0).toUpperCase() + resource.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(searchTerm || resourceFilter !== 'all') && (
              <Button variant="outline" onClick={clearFilters}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role Headers with Stats */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-4" style={{ gridTemplateColumns: `300px repeat(${roles.length}, 1fr)` }}>
            <div className="font-medium text-sm text-muted-foreground">
              Permission / Role
            </div>
            {roles.map(role => {
              const stats = getRoleStats(role.id);
              return (
                <div key={role.id} className="text-center">
                  <div className="font-medium text-sm mb-1">{role.display_name}</div>
                  <Badge variant="outline" className="text-xs">
                    {stats.granted}/{stats.total}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {stats.percentage}%
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Permission Grid by Resource */}
      <div className="space-y-4">
        {Object.keys(permissionsByResource)
          .sort((a, b) => a.localeCompare(b))
          .map(resource => {
            const resourcePermissions = permissionsByResource[resource];
            const isExpanded = expandedResources.has(resource);

            return (
              <Card key={resource}>
                <Collapsible 
                  open={isExpanded} 
                  onOpenChange={() => toggleResourceExpansion(resource)}
                >
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <CardTitle className="text-lg capitalize">
                          {resource} Permissions
                        </CardTitle>
                        <Badge variant="outline">
                          {resourcePermissions.length} permissions
                        </Badge>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0">
                      <div className="space-y-2">
                        {resourcePermissions.map(permission => (
                          <div 
                            key={permission.id}
                            className="grid gap-4 items-center py-2 border-b border-border/50 last:border-b-0"
                            style={{ gridTemplateColumns: `300px repeat(${roles.length}, 1fr)` }}
                          >
                            <div className="pr-4">
                              <div className="font-medium text-sm">
                                {getDisplayName(permission)}
                              </div>
                              <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                {permission.name}
                              </code>
                              {permission.description && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {permission.description}
                                </div>
                              )}
                            </div>
                            {roles.map(role => {
                              const hasPermissionGranted = hasPermission(role.id, permission.id);
                              
                              return (
                                <div key={role.id} className="flex justify-center">
                                  {readOnly || !onPermissionChange ? (
                                    <div className={`w-6 h-6 rounded flex items-center justify-center ${
                                      hasPermissionGranted 
                                        ? 'bg-green-100 text-green-600' 
                                        : 'bg-gray-100 text-gray-400'
                                    }`}>
                                      {hasPermissionGranted ? (
                                        <Check className="h-4 w-4" />
                                      ) : (
                                        <Minus className="h-4 w-4" />
                                      )}
                                    </div>
                                  ) : (
                                    <Checkbox
                                      checked={hasPermissionGranted}
                                      onCheckedChange={(checked) => 
                                        onPermissionChange(permission.id, !!checked)
                                      }
                                      disabled={(role.is_system ?? false) && roles.length > 1}
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
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
              {searchTerm || resourceFilter !== 'all'
                ? 'No permissions match your current filters'
                : 'No permissions available'
              }
            </p>
            {(searchTerm || resourceFilter !== 'all') && (
              <Button variant="outline" onClick={clearFilters} className="mt-4">
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 rounded flex items-center justify-center">
                <Check className="h-3 w-3 text-green-600" />
              </div>
              <span>Permission Granted</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-100 rounded flex items-center justify-center">
                <Minus className="h-3 w-3 text-gray-400" />
              </div>
              <span>Permission Not Granted</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};