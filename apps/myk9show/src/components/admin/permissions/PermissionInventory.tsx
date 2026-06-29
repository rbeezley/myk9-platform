/**
 * Permission Inventory
 *
 * Read-only, role-agnostic catalog of every permission defined in the system,
 * grouped by resource. This is the destination for the dashboard's
 * "Total Permissions" stat — it answers "what are the N permissions?" without
 * the role matrix of PermissionGrid (which is per-role) or the change-log of
 * PermissionAuditPage.
 */
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Search, KeyRound, RotateCcw, AlertCircle } from 'lucide-react';
import type { Permission } from '@/types/rbac-types';
import {
  getPermissionResource,
  getPermissionDisplayName,
} from './permissionDisplay';

interface PermissionInventoryProps {
  permissions: Permission[];
  /** True while the permission list is still being fetched. */
  isLoading?: boolean;
  /** Non-null when the fetch failed; shown instead of the (false) empty state. */
  error?: string | null;
}

export const PermissionInventory: React.FC<PermissionInventoryProps> = ({
  permissions,
  isLoading = false,
  error = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const permissionsByResource = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const filtered = term
      ? permissions.filter(
          p =>
            p.name.toLowerCase().includes(term) ||
            getPermissionDisplayName(p).toLowerCase().includes(term) ||
            (p.code?.toLowerCase().includes(term) ?? false) ||
            (p.description?.toLowerCase().includes(term) ?? false) ||
            getPermissionResource(p).toLowerCase().includes(term)
        )
      : permissions;

    const grouped = filtered.reduce<Record<string, Permission[]>>((acc, p) => {
      const resource = getPermissionResource(p);
      (acc[resource] ??= []).push(p);
      return acc;
    }, {});

    Object.values(grouped).forEach(group =>
      group.sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name))
    );

    return grouped;
  }, [permissions, searchTerm]);

  const resources = useMemo(
    () => Object.keys(permissionsByResource).sort((a, b) => a.localeCompare(b)),
    [permissionsByResource]
  );

  const matchCount = resources.reduce((sum, r) => sum + permissionsByResource[r].length, 0);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading permissions">
        <Card>
          <CardContent className="p-6">
            <div className="h-10 bg-muted rounded animate-pulse" />
          </CardContent>
        </Card>
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-3">
              <div className="h-5 w-40 bg-muted rounded animate-pulse" />
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="h-4 bg-muted rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Permission Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search permissions by name, code, or resource..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
                aria-label="Search permissions"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {matchCount} of {permissions.length} permissions
              </Badge>
              {searchTerm && (
                <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {resources.map(resource => (
        <Card key={resource}>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg capitalize">{resource} Permissions</CardTitle>
              <Badge variant="outline">
                {permissionsByResource[resource].length} permissions
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {permissionsByResource[resource].map(permission => (
                <div
                  key={permission.id}
                  className="flex flex-col gap-1 py-2 border-b border-border/50 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm">
                      {getPermissionDisplayName(permission)}
                    </div>
                    {permission.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {permission.description}
                      </div>
                    )}
                  </div>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded shrink-0 self-start">
                    {permission.code}
                  </code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {resources.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No permissions found</h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? `No permissions match "${searchTerm}"`
                : 'No permissions are defined in the system'}
            </p>
            {searchTerm && (
              <Button variant="outline" onClick={() => setSearchTerm('')} className="mt-4">
                Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PermissionInventory;
