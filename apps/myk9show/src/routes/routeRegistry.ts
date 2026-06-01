/**
 * Route Component Registry
 *
 * Central registry of all lazy loaded components for intelligent preloading
 * Maps route paths to their corresponding components
 */

import type { ComponentType } from 'react';

// Import lazy components from different route files
// Note: These are import functions, not the components themselves

// Type for import functions - uses unknown props for generic component handling
type ImportFunction = () => Promise<
  { default: ComponentType<Record<string, unknown>> } | ComponentType<Record<string, unknown>>
>;

// Admin route components
export const adminRouteComponents: Record<string, ImportFunction> = {
  '/admin/dashboard': () => import('@/pages/admin/AdminDashboard'),
  '/admin/templates': () => import('@/pages/admin/TemplateManagementPage'),
  '/admin/templates/new': () => import('@/pages/admin/TemplateEditorPage'),
  '/admin/templates/:templateId/edit': () => import('@/pages/admin/TemplateEditorPage'),
  '/admin/templates/:templateId/test': () =>
    import('@/pages/admin/TemplateTestingPage').then(m => ({ default: m.TemplateTestingPage })),
  '/admin/sync': () => import('@/pages/sync/SyncMonitoringPage'),
  '/admin/role-requests': () => import('@/pages/admin/RoleRequestsPage'),
  // Permission management
  '/admin/permissions': () => import('@/pages/admin/permissions/PermissionManagementPage'),
  '/admin/permissions/roles': () => import('@/pages/admin/permissions/RoleListPage'),
  '/admin/permissions/roles/new': () => import('@/pages/admin/permissions/CreateRolePage'),
  '/admin/permissions/roles/:roleId': () => import('@/pages/admin/permissions/RoleEditPage'),
  '/admin/permissions/roles/:roleId/clone': () => import('@/pages/admin/permissions/CloneRolePage'),
  '/admin/permissions/users': () => import('@/pages/admin/permissions/UserRoleManagementPage'),
  '/admin/permissions/audit': () => import('@/pages/admin/permissions/PermissionAuditPage'),

  // Performance and monitoring
  '/admin/performance': () =>
    import('@/components/admin/PerformanceDashboard').then(m => ({
      default: m.PerformanceDashboard,
    })),
  '/admin/data-lifecycle': () =>
    import('@/components/admin/DataLifecycleManagement').then(m => ({
      default: m.DataLifecycleManagement,
    })),
  '/admin/load-testing': () =>
    import('@/components/admin/LoadTestDashboard').then(m => ({ default: m.LoadTestDashboard })),
  '/admin/alerts': () => import('@/pages/AlertsPage'),
  '/admin/help': () => import('@/features/admin-help').then(m => ({ default: m.AdminHelpPage })),
} as const;

// Public/exhibitor route components
export const publicRouteComponents: Record<string, ImportFunction> = {
  // Show management
  '/shows': () => import('@/pages/BrowseShowsPage'),
  '/shows/:id': () => import('@/pages/ShowDetailsPage'),
  '/shows/:showId/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId': () => import('@/pages/ClassDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId/results': () =>
    import('@/pages/ClassDetailsPage'),
  '/classes/:classId': () => import('@/pages/ClassDetailsPage'),

  // Backwards-compat redirects (handled in publicRoutes, kept for preloading)
  '/browse-shows': () => import('@/pages/BrowseShowsPage'),
  '/my-entries': () => import('@/pages/MyEntriesPage'),

  // Exhibitor pages
  '/exhibitor/entries': () => import('@/pages/MyEntriesPage'),
  '/exhibitor/show-day': () => import('@/features/at-show/AtShowClassListPage'),
  '/exhibitor/check-in/:entryId': () => import('@/pages/MyEntriesPage'),
  '/exhibitor/analytics': () => import('@/pages/AnalyticsPage'),

  // Dogs management
  '/dogs': () => import('@/pages/BrowseDogsPage'),
  '/dogs/:id': () => import('@/pages/DogDetailPage'),
  '/clubs': () => import('@/pages/BrowseClubsPage'),
  '/clubs/:id': () => import('@/pages/ClubDetailPage'),

  // Feature pages
  '/calendar': () => import('@/pages/CalendarPage'),
  '/subscription': () => import('@/pages/SubscriptionPage'),
  '/registration': () => import('@/pages/CalendarPage'),
  '/shows/:showId/register': () => import('@/pages/RegistrationWizardPage'),

  // Cart and checkout
  '/cart': () => import('@/pages/CartPage'),
  '/checkout/success': () => import('@/pages/CheckoutSuccessPage'),
  '/checkout/cancel': () => import('@/pages/CheckoutCancelPage'),

  // TV Display
  '/tv/:showId': () => import('@/pages/TVDisplay'),
} as const;

// Secretary route components (these would be defined in secretaryRoutes.tsx)
export const secretaryRouteComponents: Record<string, ImportFunction> = {
  // Placeholder for secretary routes - would be populated by actual secretary routes
  '/secretary/dashboard': () =>
    import('@/pages/secretary/SecretaryDashboardPage').then(m => ({
      default: m.SecretaryDashboardPage,
    })),
  '/secretary/shows/:showId': () => import('@/pages/secretary/ShowWorkbenchPage'),
  '/shows': () => import('@/pages/BrowseShowsPage'),
  '/secretary/create-show/wizard': () => import('@/pages/secretary/ShowCreationWizardPage'),
  '/secretary/results-control': () => import('@/pages/secretary/ResultsControlPage'),
  '/secretary/run-order': () =>
    import('@/pages/secretary/RunOrderPage').then(m => ({ default: m.RunOrderPage })),
  // Add more secretary routes as they're defined
} as const;

// Judge route components (these would be defined in judgeRoutes.tsx)
export const judgeRouteComponents: Record<string, ImportFunction> = {
  // Placeholder for judge routes - would be populated by actual judge routes
  '/judge/dashboard': () => import('@/pages/JudgeDashboard'),
  '/judge/assignments': () => import('@/pages/JudgeDashboard'),
  // Add more judge routes as they're defined
} as const;

// Combined route registry for intelligent preloading
export const fullRouteRegistry: Record<string, ImportFunction> = {
  ...adminRouteComponents,
  ...publicRouteComponents,
  ...secretaryRouteComponents,
  ...judgeRouteComponents,
};

// Route categories for prioritized preloading
export const routeCategories = {
  critical: [
    '/admin/dashboard',
    '/admin/permissions',
    '/exhibitor/entries',
    '/exhibitor/show-day',
    '/shows',
  ],

  high: ['/admin/templates', '/admin/sync', '/shows', '/dogs', '/calendar'],

  medium: [
    '/admin/performance',
    '/exhibitor/analytics',
    '/admin/alerts',
    '/clubs',
    '/subscription',
  ],

  low: ['/admin/load-testing', '/tv/:showId'],
};

// Common navigation patterns for intelligent preloading
export const navigationPatterns = {
  // Admin workflow patterns
  adminDashboard: ['/admin/templates', '/admin/permissions', '/admin/performance'],
  templateManagement: ['/admin/templates/new', '/admin/dashboard'],
  permissionManagement: ['/admin/permissions/roles', '/admin/permissions/users'],

  // Exhibitor workflow patterns
  exhibitorDashboard: ['/shows', '/exhibitor/entries', '/dogs', '/exhibitor/show-day'],
  exhibitorShowDay: ['/exhibitor/entries', '/shows'],
  browseShows: ['/shows/:id', '/exhibitor/entries', '/calendar'],
  showDetails: ['/shows/:showId/trials/:trialId', '/shows'],

  // Secretary workflow patterns
  secretaryDashboard: ['/shows', '/secretary/create-show/wizard'],

  // Judge workflow patterns
  judgeDashboard: ['/judge/assignments'],
};

// Utility function to get import function for a route path
export function getRouteImportFunction(path: string): ImportFunction | null {
  // First try exact match
  if (fullRouteRegistry[path]) {
    return fullRouteRegistry[path];
  }

  // Then try pattern matching for parameterized routes
  for (const [routePattern, importFn] of Object.entries(fullRouteRegistry)) {
    if (routePattern.includes(':')) {
      const regex = new RegExp('^' + routePattern.replace(/:[^/]+/g, '[^/]+') + '$');
      if (regex.test(path)) {
        return importFn;
      }
    }
  }

  return null;
}

// Utility function to get route priority
export function getRoutePriority(path: string): 'critical' | 'high' | 'medium' | 'low' {
  for (const [priority, routes] of Object.entries(routeCategories)) {
    if (
      routes.some(route => {
        if (route.includes(':')) {
          const regex = new RegExp('^' + route.replace(/:[^/]+/g, '[^/]+') + '$');
          return regex.test(path);
        }
        return route === path;
      })
    ) {
      return priority as 'critical' | 'high' | 'medium' | 'low';
    }
  }

  return 'low';
}

// Development helper - extend window for dev tools
declare global {
  interface Window {
    __routeRegistry?: {
      fullRouteRegistry: typeof fullRouteRegistry;
      routeCategories: typeof routeCategories;
      navigationPatterns: typeof navigationPatterns;
      getRouteImportFunction: typeof getRouteImportFunction;
      getRoutePriority: typeof getRoutePriority;
      totalRoutes: number;
    };
  }
}

if (process.env.NODE_ENV === 'development') {
  window.__routeRegistry = {
    fullRouteRegistry,
    routeCategories,
    navigationPatterns,
    getRouteImportFunction,
    getRoutePriority,
    totalRoutes: Object.keys(fullRouteRegistry).length,
  };
}
