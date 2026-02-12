/**
 * Role List Page
 * Phase 3.2: Display and manage all system roles
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
// useNavigate not used in current implementation
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Shield, 
  Plus, 
  Search, 
  Edit, 
  Users,
  Settings,
  ArrowLeft,
  MoreHorizontal,
  Eye,
  Copy,
  Trash2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { rbacService } from '@/services/rbac/RBACService';
import { Role } from '@/types/rbac-types';

const RoleListPage: React.FC = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const allRoles = await rbacService.getAllRoles();
      setRoles(allRoles);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role.display_name || role.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleDeleteRole = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await rbacService.deleteRole(roleId);
      await loadRoles(); // Reload the list
    } catch (err) {
      alert(`Failed to delete role: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-2">Loading roles...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
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
              <Shield className="h-8 w-8 text-primary" />
              Role Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage system roles and their permissions
            </p>
          </div>
        </div>
        <Button asChild>
          <Link to="/admin/permissions/roles/new">
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Link>
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search roles by name, display name, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Badge variant="outline">
              {filteredRoles.length} of {roles.length} roles
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRoles.map((role) => (
          <Card key={role.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{role.display_name || role.name}</CardTitle>
                  <CardDescription className="mt-1">
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">
                      {role.name}
                    </code>
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {role.is_system && (
                    <Badge variant="secondary" className="text-xs">
                      System
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/permissions/roles/${role.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/permissions/roles/${role.id}`}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Role
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to={`/admin/permissions/roles/${role.id}/clone`}>
                          <Copy className="h-4 w-4 mr-2" />
                          Clone Role
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {!role.is_system && (
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteRole(role.id, role.display_name || role.name)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Role
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Description */}
                {role.description && (
                  <p className="text-sm text-muted-foreground">
                    {role.description}
                  </p>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Settings className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Permissions:</span>
                    <Badge variant="outline" className="text-xs">
                      {role.permission_count || 0}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Users:</span>
                    <Badge variant="outline" className="text-xs">
                      {role.user_count || 0}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t">
                  <Button 
                    asChild 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                  >
                    <Link to={`/admin/permissions/roles/${role.id}`}>
                      <Edit className="h-4 w-4 mr-2" />
                      Manage Permissions
                    </Link>
                  </Button>
                </div>

                {/* Metadata */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Created: {role.created_at ? new Date(role.created_at).toLocaleDateString() : 'N/A'}</div>
                  {/* Note: roles table has no updated_at column */}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {filteredRoles.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm ? 'No roles found' : 'No roles available'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? `No roles match your search term "${searchTerm}"`
                : 'Get started by creating your first custom role'
              }
            </p>
            {searchTerm ? (
              <Button variant="outline" onClick={() => setSearchTerm('')}>
                Clear Search
              </Button>
            ) : (
              <Button asChild>
                <Link to="/admin/permissions/roles/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Role
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg">
                {roles.filter(r => r.is_system).length}
              </div>
              <div className="text-muted-foreground">System Roles</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg">
                {roles.filter(r => !r.is_system).length}
              </div>
              <div className="text-muted-foreground">Custom Roles</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg">
                {roles.reduce((sum, r) => sum + (r.permission_count || 0), 0)}
              </div>
              <div className="text-muted-foreground">Total Permissions</div>
            </div>
            <div className="text-center p-3 border rounded">
              <div className="font-semibold text-lg">
                {roles.reduce((sum, r) => sum + (r.user_count || 0), 0)}
              </div>
              <div className="text-muted-foreground">Total Assignments</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RoleListPage;