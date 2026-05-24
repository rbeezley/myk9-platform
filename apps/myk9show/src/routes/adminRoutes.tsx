/**
 * Admin Routes - Lazy loaded routes for admin functionality
 *
 * All /admin/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Each route has its own ProtectedRoute guard for SITE_ADMIN.
 */

import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { createEnhancedLazy, RouteLazyPresets } from '@/utils/enhancedLazyLoading';

// Enhanced lazy loading with intelligent preloading and performance monitoring

// High priority: Core admin pages (preload on idle)
const AdminDashboard = createEnhancedLazy(() => import('@/pages/admin/AdminDashboard'), {
  ...RouteLazyPresets.highPriority,
  displayName: 'AdminDashboard',
});

// Medium priority: Template management (common workflow)
const TemplateManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateManagementPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateManagementPage' }
);

const TemplateEditorPage = createEnhancedLazy(() => import('@/pages/admin/TemplateEditorPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'TemplateEditorPage',
});

const TemplateTestingPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateTestingPage').then(m => ({ default: m.TemplateTestingPage })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateTestingPage' }
);

// System management (medium priority)
const SyncDashboardPage = createEnhancedLazy(() => import('@/pages/sync/SyncMonitoringPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'SyncDashboardPage',
});

// Permission Management Pages (high priority for admin security)
const PermissionManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/PermissionManagementPage'),
  { ...RouteLazyPresets.critical, displayName: 'PermissionManagementPage' }
);

const RoleListPage = createEnhancedLazy(() => import('@/pages/admin/permissions/RoleListPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'RoleListPage',
});

const RoleEditPage = createEnhancedLazy(() => import('@/pages/admin/permissions/RoleEditPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'RoleEditPage',
});

const CreateRolePage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/CreateRolePage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'CreateRolePage' }
);

const CloneRolePage = createEnhancedLazy(() => import('@/pages/admin/permissions/CloneRolePage'), {
  ...RouteLazyPresets.lowPriority,
  displayName: 'CloneRolePage',
});

const UserRoleManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/permissions/UserRoleManagementPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'UserRoleManagementPage' }
);

// Performance and Data Management Dashboards - Heavy components (low priority)
const PerformanceDashboard = createEnhancedLazy(
  () =>
    import('@/components/admin/PerformanceDashboard').then(m => ({
      default: m.PerformanceDashboard,
    })),
  { ...RouteLazyPresets.lowPriority, displayName: 'PerformanceDashboard', timeout: 45000 }
);

const DataLifecycleManagement = createEnhancedLazy(
  () =>
    import('@/components/admin/DataLifecycleManagement').then(m => ({
      default: m.DataLifecycleManagement,
    })),
  { ...RouteLazyPresets.lowPriority, displayName: 'DataLifecycleManagement', timeout: 45000 }
);

// LoadTestDashboard - only available in development/testing builds
const LoadTestDashboard = import.meta.env.DEV
  ? createEnhancedLazy(
      () =>
        import('@/components/admin/LoadTestDashboard').then(m => ({
          default: m.LoadTestDashboard,
        })),
      { ...RouteLazyPresets.lowPriority, displayName: 'LoadTestDashboard', timeout: 45000 }
    )
  : null;

// System Monitoring and Alert Management (medium priority)
const AlertsPage = createEnhancedLazy(() => import('@/pages/AlertsPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'AlertsPage',
});

const JudgeAnalyticsPage = createEnhancedLazy(() => import('@/pages/admin/JudgeAnalyticsPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'JudgeAnalyticsPage',
});

const OnboardingRequestsPage = createEnhancedLazy(
  () => import('@/pages/admin/OnboardingRequestsPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'OnboardingRequestsPage' }
);

const RBACTestPage = createEnhancedLazy(
  () => import('@/pages/admin/RBACTestPage').then(m => ({ default: m.RBACTestPage })),
  { ...RouteLazyPresets.lowPriority, displayName: 'RBACTestPage' }
);

// Admin-specific components - Placeholder components for future development
const SystemSettingsPage = () =>
  React.createElement('div', { className: 'p-6 text-center' }, 'System Settings Coming Soon');

// User Management Page - Enhanced lazy loading
const UserManagementPage = createEnhancedLazy(() => import('@/pages/admin/UserManagementPage'), {
  ...RouteLazyPresets.highPriority,
  displayName: 'UserManagementPage',
});

const RoleRequestsPage = createEnhancedLazy(() => import('@/pages/admin/RoleRequestsPage'), {
  ...RouteLazyPresets.highPriority,
  displayName: 'RoleRequestsPage',
});

// Admin Help / Page Directory — enhanced lazy loading
const AdminHelpPage = createEnhancedLazy(
  () => import('@/features/admin-help').then(m => ({ default: m.AdminHelpPage })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'AdminHelpPage' }
);

/** Helper to wrap an element with admin ProtectedRoute */
const adminGuard = (element: React.ReactNode) => (
  <ProtectedRoute requiredRole={UserRole.SITE_ADMIN}>{element}</ProtectedRoute>
);

/** All admin routes — rendered inside UnifiedAppLayout */
export const AdminRoutes = () => (
  <>
    {/* Redirect bare /admin to the dashboard */}
    <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

    {/* Admin Dashboard */}
    <Route
      path="/admin/dashboard"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <AdminDashboard />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Template Management */}
    <Route
      path="/admin/templates"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <TemplateManagementPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/templates/new"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <TemplateEditorPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/templates/:templateId/edit"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <TemplateEditorPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/templates/:templateId/test"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <TemplateTestingPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* System Management */}
    <Route
      path="/admin/sync"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <SyncDashboardPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/settings"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <SystemSettingsPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/users"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <UserManagementPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/role-requests"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <RoleRequestsPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Permission Management */}
    <Route
      path="/admin/permissions"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <PermissionManagementPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/roles"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <RoleListPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/roles/new"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <CreateRolePage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/roles/:roleId"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <RoleEditPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/roles/:roleId/clone"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <CloneRolePage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/users"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <UserRoleManagementPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/permissions/audit"
      element={adminGuard(<Navigate to="/admin/permissions?tab=audit" replace />)}
    />

    {/* Performance and Monitoring */}
    <Route
      path="/admin/performance"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <PerformanceDashboard />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    <Route
      path="/admin/data-lifecycle"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <DataLifecycleManagement />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
    {/* Load testing route - only available in development */}
    {import.meta.env.DEV && LoadTestDashboard && (
      <Route
        path="/admin/load-testing"
        element={adminGuard(
          <SuspenseWrapper>
            <PageTransition>
              <LoadTestDashboard />
            </PageTransition>
          </SuspenseWrapper>
        )}
      />
    )}

    {/* Alert Management */}
    <Route
      path="/admin/alerts"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <AlertsPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Analytics — /admin/analytics redirects to exhibitor analytics (the AnalyticsPage
        is a personal/exhibitor stats view, not platform admin analytics). Keep the
        redirect so existing links and CTAs don't 404. */}
    <Route path="/admin/analytics" element={<Navigate to="/exhibitor/analytics" replace />} />
    <Route
      path="/admin/judges/analytics"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <JudgeAnalyticsPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Onboarding Requests */}
    <Route
      path="/admin/onboarding"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <OnboardingRequestsPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* RBAC test/debug page — linked from PermissionManagementPage */}
    <Route
      path="/admin/rbac-test"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <RBACTestPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Help / Page Directory */}
    <Route
      path="/admin/help"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <AdminHelpPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
  </>
);
