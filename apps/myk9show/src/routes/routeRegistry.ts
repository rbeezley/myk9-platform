/**
 * Route Component Registry
 *
 * Route paths and their lazy-loaded components for the Admin Help route diff.
 */

import type { ComponentType } from 'react';

// Import functions use unknown props for generic component handling.
type ImportFunction = () => Promise<
  { default: ComponentType<Record<string, unknown>> } | ComponentType<Record<string, unknown>>
>;

// Admin route components
const adminRouteComponents: Record<string, ImportFunction> = {
  '/admin/dashboard': () => import('@/pages/admin/AdminDashboard'),
  '/admin/templates': () => import('@/pages/admin/TemplateManagementPage'),
  '/admin/health': () => import('@/pages/admin/SystemHealthPage'),
  '/admin/role-requests': () => import('@/pages/admin/RoleRequestsPage'),
  '/admin/users': () => import('@/pages/admin/UserManagementPage'),
  '/admin/payouts': () => import('@/pages/admin/PayoutLedgerPage'),
  '/admin/support': () => import('@/pages/admin/SupportInboxPage'),
  // Permission management
  '/admin/permissions': () => import('@/pages/admin/permissions/PermissionManagementPage'),
  // Compatibility redirect: /admin/permissions/roles renders <Navigate> to
  // /admin/permissions (see adminRoutes.tsx). No dedicated page module exists
  // for this path anymore — it resolves straight to the permissions page.
  '/admin/permissions/roles': () => import('@/pages/admin/permissions/PermissionManagementPage'),
  '/admin/permissions/roles/new': () => import('@/pages/admin/permissions/CreateRolePage'),
  '/admin/permissions/roles/:roleId': () => import('@/pages/admin/permissions/RoleEditPage'),
  '/admin/permissions/roles/:roleId/clone': () => import('@/pages/admin/permissions/CloneRolePage'),
  '/admin/permissions/audit': () => import('@/pages/admin/permissions/PermissionAuditPage'),
  // Compatibility redirect: /admin/permissions/users renders <Navigate> to
  // /admin/permissions?tab=assignments (see adminRoutes.tsx). No dedicated page
  // module exists for this path — it resolves straight to the permissions page.
  // Do not "clean up" as a duplicate of /admin/permissions/audit.
  '/admin/permissions/users': () => import('@/pages/admin/permissions/PermissionManagementPage'),

  '/admin/deleted-items': () =>
    import('@/components/admin/DataLifecycleManagement').then(m => ({
      default: m.DataLifecycleManagement,
    })),
  '/admin/load-testing': () =>
    import('@/components/admin/LoadTestDashboard').then(m => ({ default: m.LoadTestDashboard })),
  '/admin/help': () => import('@/features/admin-help').then(m => ({ default: m.AdminHelpPage })),
} as const;

// Public/exhibitor route components
const publicRouteComponents: Record<string, ImportFunction> = {
  // Show management
  '/shows': () => import('@/pages/BrowseShowsPage'),
  '/shows/:id': () => import('@/pages/ShowDetailsPage'),
  '/shows/:showId/setup': () =>
    import('@/pages/secretary/ShowWorkbenchSetupPage').then(m => ({
      default: m.ShowWorkbenchSetupPage,
    })),
  '/shows/:showId/show-desk': () =>
    import('@/pages/secretary/ShowWorkbenchShowDeskPage').then(m => ({
      default: m.ShowWorkbenchShowDeskPage,
    })),
  '/shows/:showId/entry-management': () => import('@/pages/secretary/EntryManagementPage'),
  '/shows/:showId/reports': () => import('@/pages/secretary/ReportsPage'),
  '/shows/:showId/results-control': () => import('@/pages/secretary/ResultsControlPage'),
  '/shows/:showId/submit-results': () => import('@/pages/secretary/ResultsSubmissionPage'),
  '/shows/:showId/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId': () => import('@/pages/ClassDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId/results': () =>
    import('@/pages/ClassDetailsPage'),
  '/classes/:classId': () => import('@/pages/ClassDetailsPage'),

  // Backwards-compat redirects (handled in publicRoutes)
  '/browse-shows': () => import('@/pages/BrowseShowsPage'),
  '/my-entries': () => import('@/pages/MyEntriesPage'),

  // Exhibitor pages
  '/support': () => import('@/pages/SupportTicketPage'),
  '/exhibitor/entries': () => import('@/pages/MyEntriesPage'),
  '/exhibitor/show-day': () => import('@/features/at-show/AtShowClassListPage'),
  '/exhibitor/check-in/:entryId': () => import('@/pages/MyEntriesPage'),
  '/exhibitor/analytics': () => import('@/pages/AnalyticsPage'),
  '/exhibitor/payments': () => import('@/pages/exhibitor/ExhibitorPaymentsPage'),

  // Dogs management
  '/dogs': () => import('@/pages/BrowseDogsPage'),
  '/dogs/:id': () => import('@/pages/DogDetailPage'),
  '/clubs': () => import('@/pages/BrowseClubsPage'),
  '/clubs/:id': () => import('@/pages/ClubDetailPage'),

  // Feature pages
  '/subscription': () => import('@/pages/SubscriptionPage'),
  // Legacy /registration redirects to /shows in publicRoutes.
  '/registration': () => import('@/pages/BrowseShowsPage'),
  '/shows/:showId/register': () => import('@/pages/RegistrationWizardPage'),

  // Cart and checkout
  '/cart': () => import('@/pages/CartPage'),
  '/checkout/success': () => import('@/pages/CheckoutSuccessPage'),
  '/checkout/cancel': () => import('@/pages/CheckoutCancelPage'),

  // TV Display
  '/tv/:showId': () => import('@/pages/TVDisplay'),
} as const;

// Secretary route components (these would be defined in secretaryRoutes.tsx)
const secretaryRouteComponents: Record<string, ImportFunction> = {
  // Placeholder for secretary routes - would be populated by actual secretary routes
  '/secretary/dashboard': () =>
    import('@/pages/secretary/SecretaryDashboardPage').then(m => ({
      default: m.SecretaryDashboardPage,
    })),
  '/secretary/shows/:showId': () =>
    import('@/routes/showRouteRedirects').then(m => ({
      default: m.LegacySecretaryShowRedirect,
    })),
  '/secretary/shows/:showId/*': () =>
    import('@/routes/showRouteRedirects').then(m => ({
      default: m.LegacySecretaryShowRedirect,
    })),
  '/shows': () => import('@/pages/BrowseShowsPage'),
  '/secretary/create-show/wizard': () => import('@/pages/secretary/ShowCreationWizardPage'),
  '/people': () => import('@/pages/BrowsePeoplePage'),
  // Add more secretary routes as they're defined
} as const;

// Club admin route components (mounted via clubAdminRoutes.tsx)
const clubAdminRouteComponents: Record<string, ImportFunction> = {
  '/club-admin/members': () => import('@/pages/club-admin/ClubMembersPage'),
  '/club-admin/payments': () => import('@/pages/club-admin/ClubPaymentsPage'),
} as const;

// Judge route components (these would be defined in judgeRoutes.tsx)
const judgeRouteComponents: Record<string, ImportFunction> = {
  // Placeholder for judge routes - would be populated by actual judge routes
  '/judge/dashboard': () => import('@/pages/JudgeDashboard'),
  '/results/dashboard': () => import('@/routes/ResultsDashboardRedirect'),
  // Add more judge routes as they're defined
} as const;

// Combined route registry used by the Admin Help route diff.
export const fullRouteRegistry: Record<string, ImportFunction> = {
  ...adminRouteComponents,
  ...publicRouteComponents,
  ...secretaryRouteComponents,
  ...clubAdminRouteComponents,
  ...judgeRouteComponents,
};
