/**
 * Admin Routes - Lazy loaded routes for admin functionality
 * 
 * Uses AdminLayout with sidebar navigation for all admin pages
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';

// Enhanced lazy loading with intelligent preloading and performance monitoring

// High priority: Core admin pages (preload on idle)
const AdminDashboard = createEnhancedLazy(
  () => import('@/pages/admin/AdminDashboard'),
  { ...RouteLazyPresets.highPriority, displayName: 'AdminDashboard' }
);

// Medium priority: Template management (common workflow)
const TemplateManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateManagementPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateManagementPage' }
);

const TemplateEditorPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateEditorPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateEditorPage' }
);

const TemplateTestingPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateTestingPage').then(m => ({ default: m.TemplateTestingPage })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateTestingPage' }
);

// System management (medium priority)
const SyncDashboardPage = createEnhancedLazy(
  () => import('@/pages/sync/SyncMonitoringPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'SyncDashboardPage' }
);

// Testing pages (low priority - admin only)
const PermissionTestPage = createEnhancedLazy(
  () => import('@/pages/admin/PermissionTestPage'),
  { ...RouteLazyPresets.lowPriority, displayName: 'PermissionTestPage' }
);

const RBACTestPage = createEnhancedLazy(
  () => import('@/pages/admin/RBACTestPage').then(m => ({ default: m.RBACTestPage })),
  { ...RouteLazyPresets.lowPriority, displayName: 'RBACTestPage' }
);

// Permission Management Pages (high priority for admin security)
const PermissionManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/PermissionManagementPage'),
  { ...RouteLazyPresets.critical, displayName: 'PermissionManagementPage' }
);

const RoleListPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/RoleListPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'RoleListPage' }
);

const RoleEditPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/RoleEditPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'RoleEditPage' }
);

const CreateRolePage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/CreateRolePage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'CreateRolePage' }
);

const CloneRolePage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/CloneRolePage'),
  { ...RouteLazyPresets.lowPriority, displayName: 'CloneRolePage' }
);

const UserRoleManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/UserRoleManagementPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'UserRoleManagementPage' }
);

const PermissionAuditPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/PermissionAuditPage'),
  { ...RouteLazyPresets.lowPriority, displayName: 'PermissionAuditPage' }
);

// Performance and Data Management Dashboards - Heavy components (low priority)
const PerformanceDashboard = createEnhancedLazy(
  () => import('@/components/admin/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard })),
  { ...RouteLazyPresets.lowPriority, displayName: 'PerformanceDashboard', timeout: 45000 }
);

const DataLifecycleManagement = createEnhancedLazy(
  () => import('@/components/admin/DataLifecycleManagement').then(m => ({ default: m.DataLifecycleManagement })),
  { ...RouteLazyPresets.lowPriority, displayName: 'DataLifecycleManagement', timeout: 45000 }
);

// LoadTestDashboard - only available in development/testing builds
const LoadTestDashboard = import.meta.env.DEV ? createEnhancedLazy(
  () => import('@/components/admin/LoadTestDashboard').then(m => ({ default: m.LoadTestDashboard })),
  { ...RouteLazyPresets.lowPriority, displayName: 'LoadTestDashboard', timeout: 45000 }
) : null;

const PerformanceModeToggle = createEnhancedLazy(
  () => import('@/components/admin/PerformanceModeToggle').then(m => ({ default: m.PerformanceModeToggle })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'PerformanceModeToggle' }
);

// System Monitoring and Alert Management (medium priority)
const AlertsPage = createEnhancedLazy(
  () => import('@/pages/AlertsPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AlertsPage' }
);

const AnalyticsPage = createEnhancedLazy(
  () => import('@/pages/AnalyticsPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AnalyticsPage' }
);

// Admin-specific components - Placeholder components for future development
const SystemSettingsPage = () => React.createElement('div', { className: 'p-6 text-center' }, 'System Settings Coming Soon');

// User Management Page - Enhanced lazy loading
const UserManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/UserManagementPage'),
  { ...RouteLazyPresets.highPriority, displayName: 'UserManagementPage' }
);

export const AdminRoutes = () => (
  <>
    {/* Admin Layout - wraps all admin routes with sidebar */}
    <Route path="/admin/*" element={
      <ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>
        <AdminLayout>
          <Routes>
            {/* Admin Dashboard Route */}
            <Route path="dashboard" element={
              <SuspenseWrapper>
                <PageTransition><AdminDashboard /></PageTransition>
              </SuspenseWrapper>
            } />
            
            {/* Template Management Routes */}
            <Route path="templates" element={
              <SuspenseWrapper>
                <PageTransition><TemplateManagementPage /></PageTransition>
              </SuspenseWrapper>
            } />
            
            <Route path="templates/new" element={
              <SuspenseWrapper>
                <PageTransition><TemplateEditorPage /></PageTransition>
              </SuspenseWrapper>
            } />
            
            <Route path="templates/:templateId/edit" element={
              <SuspenseWrapper>
                <PageTransition><TemplateEditorPage /></PageTransition>
              </SuspenseWrapper>
            } />
            
            <Route path="templates/:templateId/test" element={
              <SuspenseWrapper>
                <PageTransition><TemplateTestingPage /></PageTransition>
              </SuspenseWrapper>
            } />

            {/* System Management Routes */}
            <Route path="sync" element={
              <SuspenseWrapper>
                <PageTransition><SyncDashboardPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="settings" element={
              <SuspenseWrapper>
                <PageTransition><SystemSettingsPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="users" element={
              <SuspenseWrapper>
                <PageTransition><UserManagementPage /></PageTransition>
              </SuspenseWrapper>
            } />

            {/* Permission Management Routes */}
            <Route path="permissions" element={
              <SuspenseWrapper>
                <PageTransition><PermissionManagementPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/roles" element={
              <SuspenseWrapper>
                <PageTransition><RoleListPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/roles/new" element={
              <SuspenseWrapper>
                <PageTransition><CreateRolePage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/roles/:roleId" element={
              <SuspenseWrapper>
                <PageTransition><RoleEditPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/roles/:roleId/clone" element={
              <SuspenseWrapper>
                <PageTransition><CloneRolePage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/users" element={
              <SuspenseWrapper>
                <PageTransition><UserRoleManagementPage /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="permissions/audit" element={
              <SuspenseWrapper>
                <PageTransition><PermissionAuditPage /></PageTransition>
              </SuspenseWrapper>
            } />

            {/* Performance and Monitoring Routes */}
            <Route path="performance" element={
              <SuspenseWrapper>
                <PageTransition><PerformanceDashboard /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="data-lifecycle" element={
              <SuspenseWrapper>
                <PageTransition><DataLifecycleManagement /></PageTransition>
              </SuspenseWrapper>
            } />

            <Route path="performance-mode" element={
              <SuspenseWrapper>
                <PageTransition><PerformanceModeToggle /></PageTransition>
              </SuspenseWrapper>
            } />

            {/* Load testing route - only available in development */}
            {import.meta.env.DEV && LoadTestDashboard && (
              <Route path="load-testing" element={
                <SuspenseWrapper>
                  <PageTransition><LoadTestDashboard /></PageTransition>
                </SuspenseWrapper>
              } />
            )}

            {/* Alert Management Route */}
            <Route path="alerts" element={
              <SuspenseWrapper>
                <PageTransition><AlertsPage /></PageTransition>
              </SuspenseWrapper>
            } />

            {/* Analytics Route */}
            <Route path="analytics" element={
              <SuspenseWrapper>
                <PageTransition><AnalyticsPage /></PageTransition>
              </SuspenseWrapper>
            } />
          </Routes>
        </AdminLayout>
      </ProtectedRoute>
    } />

    {/* Permission Testing Routes - Available to all authenticated users for testing, outside admin layout */}
    <Route path="/admin/permission-test" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><PermissionTestPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/admin/rbac-test" element={
      <ProtectedRoute>
        <SuspenseWrapper>
          <PageTransition><RBACTestPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
  </>
);