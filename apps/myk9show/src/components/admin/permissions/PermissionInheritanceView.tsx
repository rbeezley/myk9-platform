/**
 * Permission Inheritance View Component
 * Phase 4.3: Enhanced permission inheritance system
 * Created: December 2024
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  TreePine, 
  ChevronDown, 
  ChevronRight, 
  Shield, 
  Layers, 
  Info,
  Users,
  Building
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { Permission, Role, UserPermissionsResponse, PermissionWithRole } from '@/types/rbac-types';

interface PermissionNode {
  permission: Permission;
  source: 'direct' | 'inherited' | 'role';
  sourceRole?: Role;
  children?: PermissionNode[];
  level: number;
}

interface PermissionInheritanceViewProps {
  userId: string;
  scope?: { type: string; id: string };
  className?: string;
}

export const PermissionInheritanceView: React.FC<PermissionInheritanceViewProps> = ({
  userId,
  scope,
  className = ''
}) => {
  const [permissionTree, setPermissionTree] = useState<PermissionNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPermissionInheritance = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const userPermissions = await rbacService.getUserPermissions(userId, scope);
      const tree = buildPermissionTree(userPermissions);
      setPermissionTree(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load permission inheritance');
    } finally {
      setIsLoading(false);
    }
  }, [userId, scope]);

  useEffect(() => {
    loadPermissionInheritance();
  }, [loadPermissionInheritance]);

  const buildPermissionTree = (userPermissions: UserPermissionsResponse): PermissionNode[] => {
    const nodes: PermissionNode[] = [];
    const permissionMap = new Map<string, PermissionNode>();

    // Process direct permissions
    userPermissions.permissions.forEach((perm: PermissionWithRole) => {
      const permission: Permission = {
        id: `${perm.resource}-${perm.action}`,
        name: perm.permission_name,
        display_name: perm.permission_display_name,
        description: '',
        resource: perm.resource,
        action: perm.action,
        is_system: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const node: PermissionNode = {
        permission,
        source: 'direct',
        level: 0,
        children: []
      };
      permissionMap.set(permission.id, node);
      nodes.push(node);
    });

    // Process role-based permissions
    userPermissions.roles.forEach((userRole) => {
      if (!userRole.role) return;

      const roleNode: PermissionNode = {
        permission: {
          id: `role-${userRole.role.id}`,
          name: userRole.role.name,
          display_name: userRole.role.display_name,
          description: userRole.role.description || '',
          resource: 'role',
          action: 'assume',
          is_system: userRole.role.is_system || false,
          created_at: userRole.role.created_at,
          updated_at: userRole.role.updated_at
        },
        source: 'role',
        sourceRole: userRole.role,
        level: 0,
        children: []
      };

      // Note: Role permissions would need to be fetched separately
      // This functionality is currently not implemented as Role type doesn't include permissions

      nodes.push(roleNode);
    });

    return nodes;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const resolvePermissionInheritance = (permission: Permission): PermissionNode[] => {
    const children: PermissionNode[] = [];

    // Check if this is a manage permission that implies other permissions
    if (permission.action === 'manage') {
      const baseActions = ['create', 'read', 'update', 'delete'];
      baseActions.forEach(action => {
        const impliedPermission: Permission = {
          id: `implied-${permission.resource}-${action}`,
          name: `${permission.resource}:${action}`,
          display_name: `${permission.resource.charAt(0).toUpperCase() + permission.resource.slice(1)} ${action.charAt(0).toUpperCase() + action.slice(1)}`,
          description: `Implied by manage permission`,
          resource: permission.resource,
          action,
          is_system: permission.is_system,
          created_at: permission.created_at,
          updated_at: permission.updated_at
        };

        children.push({
          permission: impliedPermission,
          source: 'inherited',
          level: 2
        });
      });
    }

    return children;
  };

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderPermissionNode = (node: PermissionNode, depth = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.permission.id);
    const indent = `ml-${depth * 4}`;

    return (
      <div key={node.permission.id} className="space-y-1">
        <div className={`flex items-center gap-2 p-2 rounded-lg border ${indent} ${
          node.source === 'direct' ? 'bg-blue-50 border-blue-200' :
          node.source === 'role' ? 'bg-purple-50 border-purple-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          {hasChildren && (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => toggleNode(node.permission.id)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          )}
          
          {!hasChildren && <div className="w-4" />}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{node.permission.display_name}</span>
              <Badge 
                variant={
                  node.source === 'direct' ? 'default' :
                  node.source === 'role' ? 'secondary' :
                  'outline'
                }
                className="text-xs"
              >
                {node.source}
              </Badge>
              {node.sourceRole && (
                <Badge variant="outline" className="text-xs">
                  via {node.sourceRole.display_name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {node.permission.name}
            </p>
          </div>

          {node.source === 'role' && (
            <Users className="h-4 w-4 text-purple-600" />
          )}
          {node.source === 'direct' && (
            <Shield className="h-4 w-4 text-blue-600" />
          )}
          {node.source === 'inherited' && (
            <Layers className="h-4 w-4 text-gray-600" />
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children!.map(child => renderPermissionNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="ml-2 text-sm">Loading permission inheritance...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TreePine className="h-5 w-5" />
          Permission Inheritance
        </CardTitle>
        <CardDescription>
          View how permissions are inherited through roles and direct assignments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scope && (
          <Alert>
            <Building className="h-4 w-4" />
            <AlertDescription>
              Showing permissions for scope: {scope.type} ({scope.id})
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-blue-600" />
              <span>Direct</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-purple-600" />
              <span>Role</span>
            </div>
            <div className="flex items-center gap-1">
              <Layers className="h-3 w-3 text-gray-600" />
              <span>Inherited</span>
            </div>
          </div>
        </div>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {permissionTree.length > 0 ? (
            permissionTree.map(node => renderPermissionNode(node))
          ) : (
            <div className="text-center py-8">
              <Info className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No permissions found</p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setExpandedNodes(new Set(permissionTree.map(n => n.permission.id)))}
          >
            Expand All
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2"
            onClick={() => setExpandedNodes(new Set())}
          >
            Collapse All
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};