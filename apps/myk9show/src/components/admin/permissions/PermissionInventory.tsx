/**
 * Permission Inventory
 *
 * Read-only, role-agnostic catalog of every permission defined in the system,
 * grouped by resource. This is the destination for the dashboard's
 * "Total Permissions" stat — it answers "what are the N permissions?" without
 * the role matrix of PermissionGrid (which is per-role) or the change-log of
 * PermissionAuditPage.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Search, RotateCcw, AlertCircle, ChevronDown, RefreshCw } from 'lucide-react';
import type { Permission } from '@/types/rbac-types';
import { getPermissionResource, getPermissionDisplayName } from './permissionDisplay';

interface PermissionInventoryProps {
  permissions: Permission[];
  /** True while the permission list is still being fetched. */
  isLoading?: boolean;
  /** Non-null when the fetch failed; shown instead of the (false) empty state. */
  error?: string | null;
  /** Reloads the permission list after an error. */
  onRetry?: () => void;
}

export const PermissionInventory: React.FC<PermissionInventoryProps> = ({
  permissions,
  isLoading = false,
  error = null,
  onRetry,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [openResources, setOpenResources] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    setOpenResources(searchTerm ? new Set(resources) : new Set());
  }, [resources, searchTerm]);

  const formatResource = (resource: string) =>
    resource.replace(/[_-]+/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          {onRetry && (
            <Button variant="outline" className="h-11" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          )}
        </AlertDescription>
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
            <CardContent className="space-y-3 p-6">
              <div className="h-5 w-40 bg-muted rounded animate-pulse" />
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
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search permissions by name, code, or resource..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-11 pl-10"
                aria-label="Search permissions"
              />
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {matchCount} of {permissions.length} permissions
              </Badge>
              {searchTerm && (
                <Button variant="outline" className="h-11" onClick={() => setSearchTerm('')}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {resources.length > 0 && (
        <Card>
          <CardContent className="divide-y p-0">
            {resources.map(resource => {
              const count = permissionsByResource[resource].length;
              const isOpen = openResources.has(resource);
              return (
                <Collapsible
                  key={resource}
                  open={isOpen}
                  onOpenChange={open =>
                    setOpenResources(current => {
                      const next = new Set(current);
                      if (open) next.add(resource);
                      else next.delete(resource);
                      return next;
                    })
                  }
                >
                  <CollapsibleTrigger
                    className="min-h-14 px-5 text-left hover:no-underline"
                    aria-label={`${formatResource(resource)} ${count} ${count === 1 ? 'permission' : 'permissions'}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="font-semibold">{formatResource(resource)}</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        {count} {count === 1 ? 'permission' : 'permissions'}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-state" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-5">
                    <div className="space-y-1 border-t border-border pt-2">
                      {permissionsByResource[resource].map(permission => (
                        <div
                          key={permission.id}
                          className="flex flex-col gap-1 border-b border-border/50 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                        >
                          <div className="min-w-0">
                            <div className="font-medium">
                              {getPermissionDisplayName(permission)}
                            </div>
                            {permission.description && (
                              <div className="mt-1 text-sm text-muted-foreground">
                                {permission.description}
                              </div>
                            )}
                          </div>
                          <code className="shrink-0 self-start rounded bg-muted px-2 py-1 text-sm">
                            {permission.code}
                          </code>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </CardContent>
        </Card>
      )}

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
