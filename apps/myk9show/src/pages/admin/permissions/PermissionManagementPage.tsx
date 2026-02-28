/**
 * Permission Management Dashboard
 * Phase 3.1: Main dashboard for RBAC administration
 * Created: December 2024
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

const PermissionManagementPage: React.FC = () => {
  const { userRoles, userPermissions, effectivePermissions, isLoading } = useRBAC();
  const [roleCount, setRoleCount] = useState<number | null>(null);
  const [permissionCount, setPermissionCount] = useState<number | null>(null);

  useEffect(() => {
    async function loadCounts() {
      try {
        const [roles, permissions] = await Promise.all([
          rbacService.getAllRoles(),
          rbacService.getAllPermissions(),
        ]);
        setRoleCount(roles.length);
        setPermissionCount(permissions.length);
      } catch {
        // Fall back to showing '—' via null state
      }
    }
    loadCounts();
  }, []);

  // Quick stats for dashboard
  const stats = [
    {
      title: 'System Roles',
      value: roleCount?.toString() ?? '—',
      description: 'Available role types',
      icon: Shield,
      link: '/admin/permissions/roles',
    },
    {
      title: 'Total Permissions',
      value: permissionCount?.toString() ?? '—',
      description: 'Available permissions',
      icon: Settings,
      link: '/admin/permissions/roles',
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
      color: 'bg-gradient-to-r from-blue-500 to-blue-600',
    },
    {
      title: 'Assign User Roles',
      description: 'Manage user role assignments',
      icon: Users,
      link: '/admin/permissions/users',
      color: 'bg-gradient-to-r from-green-500 to-green-600',
    },
    {
      title: 'View Audit Log',
      description: 'Review permission changes',
      icon: History,
      link: '/admin/permissions/audit',
      color: 'bg-gradient-to-r from-purple-500 to-purple-600',
    },
    {
      title: 'Test Permissions',
      description: 'Debug and verify permissions',
      icon: Activity,
      link: '/admin/rbac-test',
      color: 'bg-gradient-to-r from-orange-500 to-orange-600',
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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 pt-8 pb-8 max-w-7xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
                <Database className="h-8 w-8 text-primary" />
                Permission Management
              </h1>
              <p className="text-muted-foreground mt-2">
                Manage roles, permissions, and user access across the system
              </p>
            </div>
            <div className="flex gap-3">
              <Button
                asChild
                variant="outline"
                className="border-primary/20 text-primary 
                                                      hover:bg-primary/5 hover:border-primary/40 
                                                      hover:-translate-y-0.5 transition-all duration-300 
                                                      shadow-sm"
              >
                <Link to="/admin/rbac-test">
                  <Activity className="h-4 w-4 mr-2" />
                  Test Permissions
                </Link>
              </Button>
              <Button asChild>
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
                  className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                                                 border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                                                 transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                          {stat.title}
                        </p>
                        <p className="text-2xl font-bold mt-2 group-hover:text-primary transition-colors duration-300">
                          {stat.value}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">{stat.description}</p>
                      </div>
                      <div
                        className="p-2 bg-gradient-to-br from-primary/20 to-primary/10 rounded-xl 
                                     shadow-sm group-hover:shadow-xl group-hover:scale-110 
                                     transition-all duration-300"
                      >
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                    </div>
                    <Button asChild variant="ghost" size="sm" className="w-full">
                      <Link
                        to={stat.link}
                        className="hover:bg-primary/10 transition-colors duration-300"
                      >
                        View Details <ArrowRight className="h-3 w-3 ml-1" />
                      </Link>
                    </Button>
                  </div>
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
                  className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                                                   border border-border rounded-2xl p-6 shadow-sm backdrop-blur-xl 
                                                   transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
                >
                  <div
                    className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                                 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  />
                  <div className="relative">
                    <div className="flex items-start gap-4">
                      <div
                        className={`${action.color} rounded-2xl p-3 shadow-sm group-hover:shadow-xl 
                                     group-hover:scale-110 transition-all duration-300`}
                      >
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg group-hover:text-primary transition-colors duration-300">
                          {action.title}
                        </h3>
                        <p className="text-muted-foreground mb-3">{action.description}</p>
                        <Button
                          asChild
                          variant="ghost"
                          className="p-0 h-auto hover:bg-primary/10 transition-colors duration-300"
                        >
                          <Link to={action.link} className="text-primary font-medium">
                            Get Started <ArrowRight className="h-4 w-4 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Current User Info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors duration-300">
                  <UserCheck className="h-5 w-5" />
                  Your Current Roles
                </CardTitle>
                <CardDescription>Roles currently assigned to your account</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-2">
                  {userRoles.length > 0 ? (
                    userRoles.map(ur => (
                      <div
                        key={ur.id}
                        className="flex items-center justify-between p-3 border border-border/50 rounded-lg 
                                                 hover:bg-muted/50 transition-colors duration-300"
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

            <Card
              className="group relative overflow-hidden bg-gradient-to-br from-card to-card/80 
                           border border-border rounded-2xl shadow-sm backdrop-blur-xl 
                           transition-all duration-500 hover:shadow-xl hover:-translate-y-2"
            >
              <div
                className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent 
                             opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              />
              <CardHeader className="relative">
                <CardTitle className="flex items-center gap-2 group-hover:text-primary transition-colors duration-300">
                  <Settings className="h-5 w-5" />
                  Permission Summary
                </CardTitle>
                <CardDescription>Overview of your current permission level</CardDescription>
              </CardHeader>
              <CardContent className="relative">
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
                      className="w-full border-primary/20 text-primary 
                                                                            hover:bg-primary/5 hover:border-primary/40 
                                                                            transition-all duration-300"
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
  );
};

export default PermissionManagementPage;
