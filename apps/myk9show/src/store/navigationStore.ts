import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getOptimalStorage } from '@/services/database/storage-adapter';

export interface Breadcrumb {
  id: string;
  label: string;
  href?: string | undefined;
  isActive?: boolean | undefined;
}

export interface NavigationState {
  // Current navigation state
  breadcrumbs: Breadcrumb[];
  navigationHistory: string[];
  activeRoute: string;
  
  // Route metadata
  routeMetadata: Record<string, {
    title: string;
    description?: string;
    requiresAuth?: boolean;
    roles?: string[];
  }>;
  
  // Actions
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
  addToHistory: (route: string) => void;
  setActiveRoute: (route: string) => void;
  generateBreadcrumbsFromRoute: (pathname: string, params?: Record<string, string>) => Breadcrumb[];
  clearHistory: () => void;
  goBack: () => string | null;
  
  // Utility functions
  getRouteTitle: (pathname: string) => string;
  isRouteActive: (pathname: string) => boolean;
}

// Route metadata for generating breadcrumbs and titles
const ROUTE_METADATA = {
  '/': { title: 'Home' },
  '/shows': { title: 'Shows' },
  '/shows/:showId': { title: 'Show Details' },
  '/shows/:showId/trials/:trialId': { title: 'Trial Details' },
  '/shows/:showId/trials/:trialId/classes/:classId': { title: 'Class Details' },
  '/shows/:showId/trials/:trialId/classes/:classId/judge': { title: 'Judge Scoring', roles: ['judge', 'site_admin'] },
  '/shows/:showId/trials/:trialId/classes/:classId/judge/:entryId': { title: 'Judge Entry', roles: ['judge', 'site_admin'] },
  '/shows/:showId/trials/:trialId/classes/:classId/secretary': { title: 'Secretary Dashboard', roles: ['secretary', 'site_admin'] },
  '/shows/:showId/trials/:trialId/classes/:classId/results': { title: 'Results' },
  '/results/dashboard': { title: 'Result Entry Dashboard' },
  '/judge/dashboard': { title: 'Judge Dashboard', roles: ['judge', 'site_admin'] },
  '/secretary/dashboard': { title: 'Secretary Dashboard', roles: ['secretary', 'site_admin'] },
  '/exhibitor/dashboard': { title: 'Exhibitor Dashboard' },
  '/exhibitor/check-in/:entryId': { title: 'Check-in' },
  '/users': { title: 'Users' },
  '/users/:id': { title: 'User Details' },
  '/dogs': { title: 'Dogs' },
  '/dogs/:id': { title: 'Dog Details' },
  '/clubs': { title: 'Clubs' },
  '/clubs/:id': { title: 'Club Details' },
  '/calendar': { title: 'Calendar' },
  '/admin/templates': { title: 'Template Management', roles: ['site_admin'] },
  '/admin/templates/new': { title: 'New Template', roles: ['site_admin'] },
  '/admin/templates/:templateId/edit': { title: 'Edit Template', roles: ['site_admin'] },
  '/secretary/run-order': { title: 'Run Order', roles: ['secretary', 'site_admin'] }
};

// Helper function to match route patterns with actual paths
function matchRoute(pathname: string, pattern: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  
  if (patternParts.length !== pathParts.length) return false;
  
  return patternParts.every((part, index) => {
    if (part.startsWith(':')) return true; // Parameter placeholder
    return part === pathParts[index];
  });
}

// Helper function to extract parameters from a path
function extractParams(pathname: string, pattern: string): Record<string, string> {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  const params: Record<string, string> = {};
  
  patternParts.forEach((part, index) => {
    if (part.startsWith(':')) {
      const paramName = part.slice(1);
      params[paramName] = pathParts[index] || '';
    }
  });
  
  return params;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set, get) => ({
      breadcrumbs: [],
      navigationHistory: [],
      activeRoute: '/',
      routeMetadata: ROUTE_METADATA,
      
      setBreadcrumbs: (breadcrumbs) =>
        set({ breadcrumbs }),
      
      addToHistory: (route) =>
        set((state) => ({
          navigationHistory: [
            ...state.navigationHistory.filter(r => r !== route),
            route
          ].slice(-10) // Keep only last 10 routes
        })),
      
      setActiveRoute: (route) =>
        set((state) => {
          // Add to history when route changes
          const newHistory = [
            ...state.navigationHistory.filter(r => r !== route),
            route
          ].slice(-10);
          
          return {
            activeRoute: route,
            navigationHistory: newHistory
          };
        }),
      
      generateBreadcrumbsFromRoute: (pathname, params = {}) => {
        const breadcrumbs: Breadcrumb[] = [];
        const pathParts = pathname.split('/').filter(Boolean);
        
        // Add home breadcrumb
        breadcrumbs.push({
          id: 'home',
          label: 'Home',
          href: '/',
          isActive: pathname === '/'
        });
        
        if (pathname === '/') {
          return breadcrumbs;
        }
        
        // Build breadcrumbs for each path segment
        let currentPath = '';
        
        for (let i = 0; i < pathParts.length; i++) {
          currentPath += `/${pathParts[i]}`;
          const isLast = i === pathParts.length - 1;
          
          // Find matching route metadata
          const matchingPattern = Object.keys(ROUTE_METADATA).find(pattern =>
            matchRoute(currentPath, pattern)
          );
          
          if (matchingPattern) {
            const metadata = ROUTE_METADATA[matchingPattern as keyof typeof ROUTE_METADATA];
            const routeParams = extractParams(currentPath, matchingPattern);
            
            // Generate label based on route and parameters
            let label = metadata.title;
            
            // Customize labels based on parameters
            if (routeParams.showId && params.showName) {
              label = params.showName;
            } else if (routeParams.trialId && params.trialName) {
              label = params.trialName;
            } else if (routeParams.classId && params.className) {
              label = params.className;
            } else if (routeParams.entryId) {
              label = `Entry ${routeParams.entryId}`;
            }
            
            breadcrumbs.push({
              id: `breadcrumb-${i}`,
              label,
              href: isLast ? undefined : currentPath,
              isActive: isLast
            });
          }
        }
        
        return breadcrumbs;
      },
      
      clearHistory: () =>
        set({ navigationHistory: [] }),
      
      goBack: () => {
        const state = get();
        const history = state.navigationHistory;
        
        if (history.length < 2) return null;
        
        // Remove current route and return previous one
        const previousRoute = history[history.length - 2];
        
        set({
          navigationHistory: history.slice(0, -1)
        });
        
        return previousRoute;
      },
      
      getRouteTitle: (pathname) => {
        const matchingPattern = Object.keys(ROUTE_METADATA).find(pattern =>
          matchRoute(pathname, pattern)
        );
        
        if (matchingPattern) {
          return ROUTE_METADATA[matchingPattern as keyof typeof ROUTE_METADATA].title;
        }
        
        return 'Page';
      },
      
      isRouteActive: (pathname) => {
        const state = get();
        return state.activeRoute === pathname;
      }
    }),
    {
      name: 'myk9show-navigation-storage',
      storage: createJSONStorage(() => getOptimalStorage('navigation')),
      partialize: (state) => ({
        // Only persist navigation history, not current state
        navigationHistory: state.navigationHistory
      })
    }
  )
);

// Hook for easy breadcrumb generation in components
export const useBreadcrumbs = (pathname: string, params?: Record<string, string>) => {
  const { generateBreadcrumbsFromRoute, setBreadcrumbs } = useNavigationStore();
  
  const breadcrumbs = generateBreadcrumbsFromRoute(pathname, params);
  
  // Update store with generated breadcrumbs
  setBreadcrumbs(breadcrumbs);
  
  return breadcrumbs;
};

// Hook for navigation utilities
export const useNavigationUtils = () => {
  const {
    addToHistory,
    setActiveRoute,
    goBack,
    getRouteTitle,
    isRouteActive,
    clearHistory
  } = useNavigationStore();
  
  return {
    addToHistory,
    setActiveRoute,
    goBack,
    getRouteTitle,
    isRouteActive,
    clearHistory
  };
};