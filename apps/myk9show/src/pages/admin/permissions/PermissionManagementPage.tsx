/**
 * Permission Management Dashboard
 * Roles and permissions administration hub.
 * Created: December 2024
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';

const PERMISSION_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Permission Audit' },
];
import { Shield, Users, Settings, Plus } from 'lucide-react';
import { usePermissionsOverview } from '@/hooks/usePermissionsOverview';
import { PermissionInventory } from '@/components/admin/permissions/PermissionInventory';
import { RoleAssignmentsPanel } from '@/components/admin/permissions/RoleAssignmentsPanel';
import { RolesOverviewTable } from '@/components/admin/permissions/RolesOverviewTable';
import { RecentAccessChanges } from '@/components/admin/permissions/RecentAccessChanges';
import PermissionAuditPage from './PermissionAuditPage';

const PermissionManagementPage: React.FC = () => {
  const {
    roles,
    permissions,
    auditEntries,
    auditFailed,
    roleAuditFailed,
    lastChanged,
    isLoading,
    error,
    reload,
  } = usePermissionsOverview();
  const [activeTab, setActiveTab] = useUrlTab(
    ['overview', 'assignments', 'permissions', 'audit'] as const,
    'overview'
  );

  return (
    <PrimaryTabs
      tabs={PERMISSION_TABS}
      value={activeTab}
      onValueChange={setActiveTab}
      className="mb-6"
    >
      <TabsContent value="overview">
        <div className="min-h-screen bg-background">
          <div className="manager-content-container container mx-auto max-w-6xl px-6 pb-10 pt-8">
            <div className="space-y-6">
              <div className="manager-page-header manager-page-header--compact">
                <div className="min-w-0">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                    <Shield className="h-6 w-6 text-primary" />
                    Roles &amp; Permissions
                  </h1>
                  <p className="mt-2 max-w-2xl text-muted-foreground">
                    Every role in the system — open one to change what it can do.
                  </p>
                </div>
                <div className="manager-page-actions">
                  <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                    <Link to="/admin/users">
                      <Users className="mr-2 h-4 w-4" />
                      Assign roles in User Management
                    </Link>
                  </Button>
                  <Button asChild className="h-11 w-full sm:w-auto">
                    <Link to="/admin/permissions/roles/new">
                      <Plus className="mr-2 h-4 w-4" />
                      New role
                    </Link>
                  </Button>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <RolesOverviewTable
                    roles={roles}
                    lastChanged={lastChanged}
                    isLoading={isLoading}
                    error={error}
                    onRetry={reload}
                    auditFailed={roleAuditFailed}
                  />
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4" role="group" aria-label="Access summary">
                    <div className="rounded-xl border bg-card p-4">
                      <p className="font-medium text-muted-foreground">Active grants</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {isLoading || error
                          ? '–'
                          : roles.reduce((sum, role) => sum + (role.grant_count ?? 0), 0)}
                      </p>
                    </div>
                    <Link
                      to="/admin/permissions?tab=permissions"
                      className="rounded-xl border bg-card p-4"
                    >
                      <p className="font-medium text-muted-foreground">Permissions</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">
                        {permissions?.length.toString() ?? '–'}
                      </p>
                    </Link>
                  </div>
                  <RecentAccessChanges
                    entries={auditEntries}
                    isLoading={isLoading}
                    // A load failure means the audit rail's [] is unfetched
                    // state, not a genuine "nothing happened" — same
                    // principle as a standalone audit-fetch failure.
                    auditFailed={auditFailed || Boolean(error)}
                  />
                </div>
              </div>
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
                isLoading={isLoading}
                error={error}
                onRetry={reload}
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
