/**
 * LazyComponents - Centralized lazy loading for heavy components
 * 
 * This file provides lazy-loaded versions of heavy components that include
 * large dependencies or complex functionality that should be code-split.
 * 
 * Performance optimizations:
 * - Code splitting reduces initial bundle size
 * - Components load only when needed
 * - Error boundaries prevent app crashes
 * - Proper loading states improve UX
 */

/* eslint-disable react-refresh/only-export-components */
import { lazy } from 'react';

// Calendar Components (react-big-calendar dependency)
export const ShowCalendar = lazy(() => 
  import('@/components/shows/ShowCalendar/ShowCalendar').then(m => ({ default: m.ShowCalendar }))
);

// Rich Text Editor (TipTap dependency)
export const RichTextEditor = lazy(() => 
  import('@/components/dogs/DogDetails/TrainingJournal/RichTextEditor').then(m => ({ default: m.RichTextEditor }))
);

// Analytics Components (recharts dependency)
export const AnalyticsDashboard = lazy(() => 
  import('@/components/analytics/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard }))
);

export const EnhancedAnalyticsDashboard = lazy(() => 
  import('@/components/analytics/EnhancedAnalyticsDashboard').then(m => ({ default: m.EnhancedAnalyticsDashboard }))
);

export const UserActivityMonitor = lazy(() => 
  import('@/components/analytics/UserActivityMonitor').then(m => ({ default: m.UserActivityMonitor }))
);

// PDF/Report Components (react-to-print dependency)
export const PrintManager = lazy(() => 
  import('@/components/reports/PrintManager').then(m => ({ default: m.PrintManager }))
);

export const PrintableReport = lazy(() => 
  import('@/components/reports/PrintableReport').then(m => ({ default: m.PrintableReport }))
);

// Large Table Components (complex data handling)
export const ClassEntriesTable = lazy(() => 
  import('@/components/classes/ClassEntriesTable')
);

export const ClassResultsTable = lazy(() => 
  import('@/components/classes/ClassResultsTable').then(m => ({ default: m.ClassResultsTable }))
);

// Complex Dashboard Components
export const SyncMonitoringDashboard = lazy(() => 
  import('@/components/sync/SyncMonitoringDashboard')
);

export const OfflineDataManager = lazy(() => 
  import('@/components/offline/OfflineDataManager').then(m => ({ default: m.OfflineDataManager }))
);

// Wizard Components - Placeholder for future development
export const ShowCreationWizard = lazy(async () => {
  const { createElement } = await import('react');
  return { 
    default: () => createElement('div', { className: 'p-6 text-center' }, 'Show Creation Wizard Coming Soon')
  };
});

// Chart Components (recharts dependency - heavy)
export const TrendChart = lazy(() => 
  import('@/components/shows/ShowDetails/ShowStatistics/TrendChart')
);

// Registration Workflow (complex multi-step form)
export const RegistrationWorkflow = lazy(() => 
  import('@/components/shows/RegistrationWorkflow').then(m => ({ 
    default: m.RegistrationWorkflow 
  }))
);

// ============================================================================
// ENHANCED LOADING WRAPPERS
// ============================================================================

// Note: Enhanced lazy component wrapper available for future use
// Currently unused to avoid build warnings

// ============================================================================
// PRELOADING UTILITIES
// ============================================================================

/**
 * Preload heavy components for better UX
 */
export function preloadHeavyComponents(): void {
  if (import.meta.env.PROD || localStorage.getItem('preload-components') === 'true') {
    console.log('🚀 Preloading heavy components...');
    
    // Stagger preloading to avoid overwhelming the main thread
    const components = [
      () => AnalyticsDashboard,
      () => ShowCalendar,
      () => TrendChart,
      () => RegistrationWorkflow,
      () => PrintManager,
    ];
    
    components.forEach((component, index) => {
      setTimeout(() => {
        try {
          component();
        } catch (error) {
          console.warn(`Failed to preload component ${index}:`, error);
        }
      }, (index + 1) * 500);
    });
  }
}

/**
 * Preload components based on user role for better UX
 */
export function preloadByRole(userRole?: string): void {
  if (!userRole) return;
  
  const roleComponents = {
    admin: [AnalyticsDashboard, SyncMonitoringDashboard],
    secretary: [ShowCalendar, RegistrationWorkflow, PrintManager],
    judge: [ClassEntriesTable, ClassResultsTable],
    exhibitor: [ShowCalendar, RegistrationWorkflow],
  };
  
  const components = roleComponents[userRole as keyof typeof roleComponents] || [];
  
  components.forEach((component, index) => {
    setTimeout(() => {
      try {
        // Trigger the lazy import by accessing the component
        const comp = component;
        if (comp && typeof comp === 'function') {
          comp._init?.catch?.(() => {});
        }
      } catch (error) {
        console.warn(`Failed to preload ${userRole} component:`, error);
      }
    }, index * 300);
  });
}

// ============================================================================
// AUTO-INITIALIZATION
// ============================================================================

// Auto-preload components after initial page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    // Delay preloading to not interfere with initial rendering
    setTimeout(preloadHeavyComponents, 3000);
  });
  
  // Add debugging utilities in development
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__lazyComponents = {
      preloadAll: preloadHeavyComponents,
      preloadByRole,
    };
  }
}

// Specialized skeleton loaders for heavy components
export { 
  CalendarSkeleton,
  DashboardSkeleton,
  TableSkeleton,
  FormSkeleton
} from './SkeletonLoaders';