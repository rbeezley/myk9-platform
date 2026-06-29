/**
 * Permission Management Dashboard
 * Phase 3.1: Main dashboard for RBAC administration
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useUrlTab } from '@/hooks/useUrlTab';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';

const PERMISSION_TABS: PrimaryTabDef[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'audit', label: 'Permission Audit' },
];
import {
  Shield,
  Users,
  Settings,
  FileText,
  UserCheck,
  History,
  Plus,
  ArrowRight,
  Database,
  Activity,
} from 'lucide-react';
import { useRBAC } from '@/hooks/useRBAC';
import { rbacService } from '@/services/rbac/RBACService';
import { RBACMigrationStatus } from '@/components/rbac/RBACMigrationStatus';
import { PermissionInventory } from '@/components/admin/permissions/PermissionInventory';
import type { Permission } from '@/types/rbac-types';
import PermissionAuditPage from './PermissionAuditPage';

const PermissionManagementPage: React.FC = () => {
  const { userRoles, userPermissions, effectivePermissions, isLoading } = useRBAC();
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissions, setPermissions] = useState<Permission[] | null>(null);
  const [permissionsError, setPermissionsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useUrlTab(
    ['overview', 'permissions', 'audit'] as const,
    'overview'
  );

  useEffect(() => {
    async function loadCounts() {
      try {
        const [roles, allPermissions] = await Promise.all([
          rbacService.getAllRoles(),
          rbacService.getAllPermissions(),
        ]);
        setRoleCount(roles.length);
        setPermissions(allPermissions);
      } catch (err) {
        // Counts fall back to the placeholder; the inventory tab surfaces the
        // error explicitly instead of a false "no permissions" empty state.
        setPermissionsError(
          err instanceof Error ? err.message : 'Failed to load permissions'
        );
      }
    }
    loadCounts();
  }, []);

  const permissionCount = permissions?.length ?? null;
  // Distinguish "still fetching" from "genuinely empty" so the inventory tab
  // doesn't flash a false "No permissions defined" during a direct deep-load.
  const permissionsLoading = permissions === null && !permissionsError;

  // Quick stats for dashboard
  const stats = [
    {
      title: 'System Roles',
      value: roleCount?.toString() ?? '–',
      description: 'Available role types',
      icon: Shield,
      link: '/admin/permissions/roles',
    },
    {
      title: 'Total Permissions',
      value: permissionCount?.toString() ?? '–',
      description: 'Available permissions',
      icon: Settings,
      link: '/admin/permissions?tab=permissions',
    },
    {
      title: 'Active Users',
      value: userRoles.length.toString(),
      description: 'Users with assigned roles',
      icon: Users,
      link: '/admin/permissions/users',
    },
    {
      title: 'Your Permissions',
      value: effectivePermissions.length.toString(),
      description: 'Your effective permissions',
      icon: UserCheck,
      link: '/admin/rbac-test',
    },
  ];

  const quickActions = [
    {
      title: 'Manage Roles',
      description: 'View and edit role permissions',
      icon: Shield,
      link: '/admin/permissions/roles',
    },
    {
      title: 'Assign User Roles',
      description: 'Manage user role assignments',
      icon: Users,
      link: '/admin/permissions/users',
    },
    {
      title: 'View Audit Log',
      description: 'Review permission changes',
      icon: History,
      link: '/admin/permissions?tab=audit',
    },
    {
      title: 'Test Permissions',
      description: 'Debug and verify permissions',
      icon: Activity,
      link: '/admin/rbac-test',
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
          <div className="space-y-8">
            {/* Header Skeleton */}
            <div className="space-y-3">
              <div className="h-8 bg-muted rounded-lg w-64 animate-pulse" />
              <div className="h-4 bg-muted rounded w-96 animate-pulse" />
            </div>

            {/* Stats Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-6 rounded-2xl border bg-card">
                  <div className="space-y-3">
                    <div className="h-4 bg-muted rounded w-24 animate-pulse" />
                    <div className="h-8 bg-muted rounded w-16 animate-pulse" />
                    <div className="h-3 bg-muted rounded w-20 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PrimaryTabs
      tabs={PERMISSION_TABS}
      value={activeTab}
      onValueChange={setActiveTab}
      className="mb-6"
    >
      <TabsContent value="overview">
        <div className="min-h-screen bg-background">
          <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
            <div className="space-y-8">
              {/* Header */}
              <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                    <Database className="h-6 w-6 text-primary" />
                    Permission Management
                  </h1>
                  <p className="text-muted-foreground mt-2">
                    Manage roles, permissions, and user access across the system
                  </p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap md:w-auto md:justify-end">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40 shadow-sm sm:w-auto"
                  >
                    <Link to="/admin/rbac-test">
                      <Activity className="h-4 w-4 mr-2" />
                      Test Permissions
                    </Link>
                  </Button>
                  <Button asChild className="w-full sm:w-auto">
                    <Link to="/admin/permissions/roles">
                      <Plus className="h-4 w-4 mr-2" />
                      Manage Roles
                    </Link>
                  </Button>
                </div>
              </div>

              {/* Migration Status */}
              <RBACMigrationStatus showDetails />

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map(stat => {
                  const Icon = stat.icon;
                  return (
                    <Card
                      key={stat.title}
                      className="group rounded-2xl border border-border p-6 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                          <p className="mt-2 text-3xl font-semibold tabular-nums">{stat.value}</p>
                          <p className="text-sm text-muted-foreground mt-1">{stat.description}</p>
                        </div>
                        <div className="rounded-xl bg-primary/10 p-2 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>
                      <Button asChild variant="ghost" size="sm" className="w-full">
                        <Link to={stat.link} className="hover:bg-primary/10">
                          View Details <ArrowRight className="h-3 w-3 ml-1" />
                        </Link>
                      </Button>
                    </Card>
                  );
                })}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {quickActions.map(action => {
                  const Icon = action.icon;
                  return (
                    <Card
                      key={action.title}
                      className="group rounded-2xl border border-border p-6 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold transition-colors group-hover:text-primary">
                            {action.title}
                          </h3>
                          <p className="text-muted-foreground mb-3">{action.description}</p>
                          <Button
                            asChild
                            variant="ghost"
                            className="p-0 h-auto hover:bg-primary/10"
                          >
                            <Link to={action.link} className="text-primary font-medium">
                              Get Started <ArrowRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Current User Info */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UserCheck className="h-5 w-5 text-muted-foreground" />
                      Your Current Roles
                    </CardTitle>
                    <CardDescription>Roles currently assigned to your account</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {userRoles.length > 0 ? (
                        userRoles.map(ur => (
                          <div
                            key={ur.id}
                            className="flex items-center justify-between p-3 border border-border/50 rounded-lg hover:bg-muted/50 transition-colors"
                          >
                            <div>
                              <Badge variant={ur.is_active ? 'default' : 'secondary'}>
                                {ur.role?.display_name || ur.role?.name}
                              </Badge>
                              {ur.scope_type && (
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({ur.scope_type}: {ur.scope_id})
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {ur.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground py-8 text-center">No roles assigned</p>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-2xl border border-border shadow-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5 text-muted-foreground" />
                      Permission Summary
                    </CardTitle>
                    <CardDescription>Overview of your current permission level</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm font-medium">Direct Permissions:</span>
                        <Badge variant="outline" className="bg-background/50">
                          {userPermissions.length}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                        <span className="text-sm font-medium">Effective Permissions:</span>
                        <Badge variant="outline" className="bg-background/50">
                          {effectivePermissions.length}
                        </Badge>
                      </div>
                      <div className="pt-2">
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="w-full border-primary/20 text-primary hover:bg-primary/5 hover:border-primary/40"
                        >
                          <Link to="/admin/rbac-test">
                            <FileText className="h-4 w-4 mr-2" />
                            View All Permissions
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
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
