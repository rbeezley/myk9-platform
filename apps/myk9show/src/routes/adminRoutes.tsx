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

const PayoutLedgerPage = createEnhancedLazy(() => import('@/pages/admin/PayoutLedgerPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'PayoutLedgerPage',
});

const SupportInboxPage = createEnhancedLazy(() => import('@/pages/admin/SupportInboxPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'SupportInboxPage',
});

// Medium priority: read-only sport-rules viewer
const TemplateManagementPage = createEnhancedLazy(
  () => import('@/pages/admin/TemplateManagementPage'),
  { ...RouteLazyPresets.mediumPriority, displayName: 'TemplateManagementPage' }
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

const DeletedItemsPage = createEnhancedLazy(
  () =>
    import('@/components/admin/DataLifecycleManagement').then(m => ({
      default: m.DataLifecycleManagement,
    })),
  { ...RouteLazyPresets.mediumPriority, displayName: 'DeletedItemsPage', timeout: 45000 }
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

const SystemHealthPage = createEnhancedLazy(() => import('@/pages/admin/SystemHealthPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'SystemHealthPage',
});

const JudgeAnalyticsPage = createEnhancedLazy(() => import('@/pages/admin/JudgeAnalyticsPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'JudgeAnalyticsPage',
});

const RBACTestPage = createEnhancedLazy(
  () => import('@/pages/admin/RBACTestPage').then(m => ({ default: m.RBACTestPage })),
  { ...RouteLazyPresets.lowPriority, displayName: 'RBACTestPage' }
);

// User Management Page - Enhanced lazy loading
const UserManagementPage = createEnhancedLazy(() => import('@/pages/admin/UserManagementPage'), {
  ...RouteLazyPresets.highPriority,
  displayName: 'UserManagementPage',
});

const RoleRequestsPage = createEnhancedLazy(() => import('@/pages/admin/RoleRequestsPage'), {
  ...RouteLazyPresets.highPriority,
  displayName: 'RoleRequestsPage',
});

const OnboardingInboxPage = createEnhancedLazy(() => import('@/pages/admin/OnboardingInboxPage'), {
  ...RouteLazyPresets.mediumPriority,
  displayName: 'OnboardingInboxPage',
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

    {/* Payments & Payouts — platform fee + cross-club payout ledger */}
    <Route
      path="/admin/payouts"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <PayoutLedgerPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Support Inbox */}
    <Route
      path="/admin/support"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <SupportInboxPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />

    {/* Sport Rules (read-only) */}
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

    {/* System Management */}
    <Route
      path="/admin/health"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <SystemHealthPage />
          </PageTransition>
        </SuspenseWrapper>
      )}
    />
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
    <Route
      path="/admin/onboarding"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <OnboardingInboxPage />
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
    {/* The roles list now lives on the overview console — see
        docs/plan-permissions-overview-roles-console.md. Kept as a redirect
        because CreateRolePage / CloneRolePage / RoleEditPage all link back
        here, matching the /admin/permissions/users precedent below. */}
    <Route
      path="/admin/permissions/roles"
      element={adminGuard(<Navigate to="/admin/permissions" replace />)}
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
    {/* Retired 2026-08: role granting consolidated onto /admin/users. The URL
        stays alive so bookmarks and older links land on the ledger tab.
        See docs/plan-role-assignment-consolidation.md */}
    <Route
      path="/admin/permissions/users"
      element={<Navigate to="/admin/permissions?tab=assignments" replace />}
    />
    <Route
      path="/admin/permissions/audit"
      element={adminGuard(<Navigate to="/admin/permissions?tab=audit" replace />)}
    />

    {/* Deleted Items — real soft-delete restore surface */}
    <Route
      path="/admin/data-lifecycle"
      element={adminGuard(<Navigate to="/admin/deleted-items" replace />)}
    />
    <Route
      path="/admin/deleted-items"
      element={adminGuard(
        <SuspenseWrapper>
          <PageTransition>
            <DeletedItemsPage />
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
