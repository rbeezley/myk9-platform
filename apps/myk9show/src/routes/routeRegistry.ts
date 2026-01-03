/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Route Component Registry
 * 
 * Central registry of all lazy loaded components for intelligent preloading
 * Maps route paths to their corresponding components
 */

import type { ComponentType } from 'react';

// Import lazy components from different route files  
// Note: These are import functions, not the components themselves

// Type for import functions
type ImportFunction = () => Promise<{ default: ComponentType<any> } | ComponentType<any>>;

// Admin route components
export const adminRouteComponents: Record<string, ImportFunction> = {
  '/admin/dashboard': () => import('@/pages/admin/AdminDashboard'),
  '/admin/templates': () => import('@/pages/admin/TemplateManagementPage'),
  '/admin/templates/new': () => import('@/pages/admin/TemplateEditorPage'),
  '/admin/templates/:templateId/edit': () => import('@/pages/admin/TemplateEditorPage'),
  '/admin/templates/:templateId/test': () => import('@/pages/admin/TemplateTestingPage').then(m => ({ default: m.TemplateTestingPage })),
  '/admin/sync': () => import('@/pages/sync/SyncMonitoringPage'),
  // Permission management
  '/admin/permissions': () => import('@/pages/admin/permissions/PermissionManagementPage'),
  '/admin/permissions/roles': () => import('@/pages/admin/permissions/RoleListPage'),
  '/admin/permissions/roles/new': () => import('@/pages/admin/permissions/CreateRolePage'),
  '/admin/permissions/roles/:roleId': () => import('@/pages/admin/permissions/RoleEditPage'),
  '/admin/permissions/roles/:roleId/clone': () => import('@/pages/admin/permissions/CloneRolePage'),
  '/admin/permissions/users': () => import('@/pages/admin/permissions/UserRoleManagementPage'),
  '/admin/permissions/audit': () => import('@/pages/admin/permissions/PermissionAuditPage'),
  
  // Performance and monitoring
  '/admin/performance': () => import('@/components/admin/PerformanceDashboard').then(m => ({ default: m.PerformanceDashboard })),
  '/admin/data-lifecycle': () => import('@/components/admin/DataLifecycleManagement').then(m => ({ default: m.DataLifecycleManagement })),
  '/admin/performance-mode': () => import('@/components/admin/PerformanceModeToggle').then(m => ({ default: m.PerformanceModeToggle })),
  '/admin/load-testing': () => import('@/components/admin/LoadTestDashboard').then(m => ({ default: m.LoadTestDashboard })),
  '/admin/alerts': () => import('@/pages/AlertsPage'),
  '/admin/analytics': () => import('@/pages/AnalyticsPage'),
  
  // Testing routes
  '/admin/permission-test': () => import('@/pages/admin/PermissionTestPage'),
  '/admin/rbac-test': () => import('@/pages/admin/RBACTestPage').then(m => ({ default: m.RBACTestPage })),
} as const;

// Public/exhibitor route components
export const publicRouteComponents: Record<string, ImportFunction> = {
  // Show management
  '/shows': () => import('@/pages/ShowDetailsPage'),
  '/shows/:id': () => import('@/pages/ShowDetailsPage'),
  '/shows/:showId/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/trials/:trialId': () => import('@/pages/TrialDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId': () => import('@/pages/ClassDetailsPage'),
  '/shows/:showId/trials/:trialId/classes/:classId/results': () => import('@/pages/ClassDetailsPage'),
  '/classes/:classId': () => import('@/pages/ClassDetailsPage'),
  
  // Browsing and entries
  '/browse-shows': () => import('@/pages/BrowseShowsPage'),
  '/shows/browse': () => import('@/pages/BrowseShowsPage'),
  '/my-entries': () => import('@/pages/BrowseShowsPage'),
  
  // Exhibitor dashboard
  '/exhibitor/dashboard': () => import('@/pages/ExhibitorDashboard'),
  '/exhibitor/account': () => import('@/pages/ExhibitorDashboard'),
  '/exhibitor/entries': () => import('@/pages/BrowseShowsPage'),
  '/exhibitor/entries/history': () => import('@/pages/BrowseShowsPage'),
  '/exhibitor/results': () => import('@/pages/BrowseShowsPage'),
  '/exhibitor/favorites': () => import('@/pages/BrowseShowsPage'),
  '/exhibitor/health-records': () => import('@/pages/DogDetailsPage'),
  '/exhibitor/training': () => import('@/pages/DogDetailsPage'),
  '/exhibitor/forms': () => import('@/pages/ExhibitorDashboard'),
  '/exhibitor/standards': () => import('@/pages/ExhibitorDashboard'),
  '/exhibitor/help': () => import('@/pages/ExhibitorDashboard'),
  '/exhibitor/check-in/:entryId': () => import('@/components/exhibitor/ClassCheckIn'),
  
  // Users and dogs management
  '/users': () => import('@/pages/UserDetailsPage'),
  '/users/:id': () => import('@/pages/UserDetailsPage'),
  '/dogs': () => import('@/pages/DogDetailsPage'),
  '/dogs/:id': () => import('@/pages/DogDetailsPage'),
  '/clubs': () => import('@/pages/ClubsPage'),
  '/clubs/:id': () => import('@/pages/ClubsPage'),
  
  // Feature pages
  '/calendar': () => import('@/pages/CalendarPage'),
  '/subscription': () => import('@/pages/SubscriptionPage'),
  '/registration': () => import('@/pages/CalendarPage'),
  
  // Test routes
  '/class-templates': () => import('@/components/classes/ClassTemplateTestPage').then(m => ({ default: m.ClassTemplateTestPage })),
} as const;

// Secretary route components (these would be defined in secretaryRoutes.tsx)
export const secretaryRouteComponents: Record<string, ImportFunction> = {
  // Placeholder for secretary routes - would be populated by actual secretary routes
  '/secretary/dashboard': () => import('@/pages/SecretaryDashboard'),
  '/secretary/shows': () => import('@/pages/ShowDetailsPage'),
  '/secretary/classes': () => import('@/pages/secretary/ShowCreationWizardPage'),
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
    '/exhibitor/dashboard',
    '/browse-shows',
  ],
  
  high: [
    '/admin/templates',
    '/admin/sync',
    '/shows',
    '/users',
    '/dogs',
    '/calendar',
  ],
  
  medium: [
    '/admin/performance',
    '/admin/analytics',
    '/admin/alerts',
    '/clubs',
    '/subscription',
  ],
  
  low: [
    '/admin/permission-test',
    '/admin/rbac-test',
    '/admin/load-testing',
    '/class-templates',
  ],
};

// Common navigation patterns for intelligent preloading
export const navigationPatterns = {
  // Admin workflow patterns
  adminDashboard: ['/admin/templates', '/admin/permissions', '/admin/performance'],
  templateManagement: ['/admin/templates/new', '/admin/dashboard'],
  permissionManagement: ['/admin/permissions/roles', '/admin/permissions/users'],
  
  // Exhibitor workflow patterns  
  exhibitorDashboard: ['/browse-shows', '/exhibitor/entries', '/dogs'],
  browseShows: ['/shows/:id', '/exhibitor/dashboard', '/calendar'],
  showDetails: ['/shows/:showId/trials/:trialId', '/browse-shows'],
  
  // Secretary workflow patterns
  secretaryDashboard: ['/secretary/shows', '/secretary/classes'],
  
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
      const regex = new RegExp(
        '^' + routePattern.replace(/:[^/]+/g, '[^/]+') + '$'
      );
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
    if (routes.some(route => {
      if (route.includes(':')) {
        const regex = new RegExp('^' + route.replace(/:[^/]+/g, '[^/]+') + '$');
        return regex.test(path);
      }
      return route === path;
    })) {
      return priority as 'critical' | 'high' | 'medium' | 'low';
    }
  }
  
  return 'low';
}

// Development helper
if (process.env.NODE_ENV === 'development') {
  (window as any).__routeRegistry = {
    fullRouteRegistry,
    routeCategories,
    navigationPatterns,
    getRouteImportFunction,
    getRoutePriority,
    totalRoutes: Object.keys(fullRouteRegistry).length
  };
}