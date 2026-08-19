/**
 * Permission Management Dashboard
 * Roles and permissions administration hub.
 * Created: December 2024
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';

const PERMISSION_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Permission Audit' },
];
import {
  Shield,
  Users,
  Settings,
  History,
  Plus,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { rbacService } from '@/services/rbac/RBACService';
import { PermissionInventory } from '@/components/admin/permissions/PermissionInventory';
import { RoleAssignmentsPanel } from '@/components/admin/permissions/RoleAssignmentsPanel';
import type { Permission } from '@/types/rbac-types';
import PermissionAuditPage from './PermissionAuditPage';

const PermissionManagementPage: React.FC = () => {
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useUrlTab(
    ['overview', 'assignments', 'permissions', 'audit'] as const,
    'overview'
  );

  const loadCounts = useCallback(async () => {
    try {
      const [roles, allPermissions] = await Promise.all([
        rbacService.getAllRoles(),
        rbacService.getAllPermissions(),
      ]);
      setRoleCount(roles.length);
      setPermissions(allPermissions);
      setPermissionsError(null);
    } catch {
      setPermissionsError("We couldn't load the access summary.");
    }
  }, []);

  useEffect(() => {
    // This starts an external service read; state updates occur after the promise settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCounts();
  }, [loadCounts]);

  const permissionCount = permissions?.length ?? null;
  // Distinguish "still fetching" from "genuinely empty" so the inventory tab
  // doesn't flash a false "No permissions defined" during a direct deep-load.
  const permissionsLoading = permissions === null && !permissionsError;

  return (
    <PrimaryTabs
      tabs={PERMISSION_TABS}
      value={activeTab}
      onValueChange={setActiveTab}
      className="mb-6"
    >
      <TabsContent value="overview">
        <div className="min-h-screen bg-background">
          <div className="container mx-auto max-w-6xl px-6 pb-10 pt-8">
            <div className="space-y-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <Shield className="h-6 w-6 text-primary" />
                    Roles &amp; Permissions
                  </h1>
                  <p className="mt-2 max-w-2xl text-muted-foreground">
                    Define what each role can do, review who has access, and trace every change.
                  </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
                  <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                    <Link to="/admin/users">
                      <Users className="mr-2 h-4 w-4" />
                      Assign roles in User Management
                    </Link>
                  </Button>
                  <Button asChild className="h-11 w-full sm:w-auto">
                    <Link to="/admin/permissions/roles">
                      <Plus className="mr-2 h-4 w-4" />
                      Manage roles
                    </Link>
                  </Button>
                </div>
              </div>

              {permissionsError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{permissionsError}</span>
                    <Button variant="outline" className="h-11" onClick={() => void loadCounts()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Try again
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <Card>
                <CardContent className="p-0">
                  <div className="grid md:grid-cols-2 md:divide-x md:divide-border">
                    <div className="flex items-center justify-between gap-4 p-5">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">System Roles</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {roleCount?.toString() ?? '–'}
                        </p>
                      </div>
                      <Button asChild variant="ghost" className="h-11">
                        <Link to="/admin/permissions/roles">
                          Review roles <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-4 border-t border-border p-5 md:border-t-0">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          Total Permissions
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">
                          {permissionCount?.toString() ?? '–'}
                        </p>
                      </div>
                      <Button asChild variant="ghost" className="h-11">
                        <Link to="/admin/permissions?tab=permissions">
                          Review permissions <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <section
                aria-labelledby="access-flow-heading"
                className="rounded-xl border bg-card p-6"
              >
                <h2 id="access-flow-heading" className="text-lg font-semibold">
                  How access works
                </h2>
                <div className="mt-5 grid gap-5 md:grid-cols-3">
                  <div className="flex gap-3">
                    <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-medium">Define roles</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Choose the permissions each role includes.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-medium">Assign access</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Grant roles to people from User Management.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <History className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div>
                      <h3 className="font-medium">Trace changes</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Use Permission Audit to review every access change.
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="assignments">
        <RoleAssignmentsPanel />
      </TabsContent>

      <TabsContent value="permissions">
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
            <div className="space-y-8">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
                  <Settings className="h-8 w-8 text-primary" />
                  Permission Inventory
                </h1>
                <p className="text-muted-foreground mt-2">
                  Every permission defined in the system, grouped by resource
                </p>
              </div>
              <PermissionInventory
                permissions={permissions ?? []}
                isLoading={permissionsLoading}
                error={permissionsError}
                onRetry={() => void loadCounts()}
              />
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="audit">
        <PermissionAuditPage />
      </TabsContent>
    </PrimaryTabs>
  );
};

export default PermissionManagementPage;
