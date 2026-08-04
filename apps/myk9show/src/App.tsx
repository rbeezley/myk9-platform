import React from 'react';
import { Outlet } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  optimizeQueryCache,
  setupQueryPerformanceMonitoring,
  prefetchCriticalData,
} from '@/utils/performanceOptimizations';
import { friendlyDbError } from '@/utils/friendlyDbError';

import { logger } from '@/services/LoggingService';
import { AppShellMobileNavProvider } from './components/layout/AppShellMobileNavProvider';

// Components
import AppHeader from './components/layout/AppHeader';
import ErrorBoundary from './components/common/ErrorBoundary';
import { NetworkStatusProvider } from './components/common/NetworkStatusProvider';

// Context
import { AuthProvider } from './context/AuthContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import {
  shouldLoadPeopleDirectory,
  keepPeopleDirectoryPurged,
  areRolesResolved,
} from '@/services/database/users/peopleDirectoryAccess';
import { useAnnouncementSubscription } from '@/hooks/useAnnouncementSubscription';
import { useMessageSubscription } from '@/hooks/useMessageSubscription';
import { useNotificationMonitor } from '@/hooks/useNotificationMonitor';
import { AudioSettingsProvider } from './context/AudioSettingsContext';
import { StoreProvider } from './providers/StoreProvider';
import { ReplicationSyncProvider } from './providers/ReplicationSyncProvider';

// Panel System
import { PanelProvider } from './components/panels/PanelContext';

// Notification System
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { AppToaster } from '@/components/layout/AppToaster';

// Exhibitor Onboarding
import { ExhibitorOnboardingChecker } from './components/exhibitor';

// PWA Install
import { PWAInstallBanner } from './components/pwa/PWAInstallBanner';

// Error Handling
import { GlobalErrorHandler } from './services/error/GlobalErrorHandler';

// Debug utilities - only load in development
if (import.meta.env.DEV) {
  import('./utils/debugUtils');
  import('./utils/clearAllStorage');
  // Storage benchmarking disabled to reduce performance overhead for minimal data scenarios
  // Uncomment the lines below if you need to benchmark storage performance
  // import('./utils/storage-benchmarking').then(({ runStorageBenchmark }) => {
  //   // Run storage benchmark after a delay to avoid blocking startup
  //   setTimeout(runStorageBenchmark, 3000);
  // }).catch(error => {
  //   logger.warn('Failed to load storage benchmarking:', 'app', {}, error as Error);
  // });
}

// Database optimization - removed preloading for better startup performance

const queryClient = new QueryClient();

// Apply performance optimizations
optimizeQueryCache(queryClient);
setupQueryPerformanceMonitoring(queryClient);

// Prefetch critical data after a short delay to avoid blocking startup
if (typeof window !== 'undefined') {
  setTimeout(() => prefetchCriticalData(queryClient), 1000);
}

// Error fallback component
const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error | null;
  resetErrorBoundary: () => void;
}) => {
  const message = React.useMemo(
    () => friendlyDbError(error, 'Something went wrong. Please try again.'),
    [error]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full p-6 bg-card rounded-lg shadow-md">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 bg-destructive/10 rounded-full mb-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">{message}</p>
          <div className="flex gap-4">
            <button
              onClick={resetErrorBoundary}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/')}
              className="px-4 py-2 border border-input rounded-md hover:bg-accent hover:text-accent-foreground transition-colors dark:border-gray-700 dark:hover:bg-gray-800"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Track initialization to prevent duplicate runs in StrictMode
const initializationState = {
  errorHandler: false,
};

// Loads users whenever the authenticated user changes (e.g. after login).
// Must render inside AuthProvider.
function UserDataInitializer() {
  const { user, userWithRoles, rbacLoading } = useAuthContext();
  // SA-008: only management surfaces consume the people directory. Gate the
  // bulk fetch so a plain-exhibitor session never loads it. Re-runs if roles
  // resolve after `user` (RBAC loads async).
  const shouldLoad = shouldLoadPeopleDirectory(userWithRoles?.roles);
  // Roles are only truly resolved when RBAC finished AND userWithRoles is set —
  // `!rbacLoading` alone is true during the initial auth window (see helper).
  const rolesResolved = areRolesResolved({ rbacLoading, hasUserWithRoles: !!userWithRoles });

  React.useEffect(() => {
    if (!user) return;

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const run = async () => {
      const { useUserStore } = await import('./store/userStore');
      if (cancelled) return;

      if (shouldLoad) {
        try {
          await useUserStore.getState().loadUsers();
        } catch (error) {
          logger.error('Failed to load user data after auth:', 'app', {}, error as Error);
        }
        return;
      }

      // SA-008: non-management session. Wait until roles ACTUALLY resolve (not
      // just !rbacLoading — that is true too early), then keep any people
      // directory a prior management session persisted in this browser
      // (myk9show-user-storage, async IndexedDB) purged — now and on rehydration.
      if (!rolesResolved) return;

      const stop = keepPeopleDirectoryPurged(
        {
          getPeopleCount: () => useUserStore.getState().people.length,
          clearPeople: () => useUserStore.getState().setUsers([]),
          subscribe: listener => useUserStore.subscribe(listener),
        },
        { rolesResolved: true, canLoadDirectory: false }
      );
      if (cancelled) stop();
      else unsubscribe = stop;
    };

    run();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [user, shouldLoad, rolesResolved]);

  return null;
}

function AnnouncementSubscriptionInitializer() {
  useAnnouncementSubscription();
  return null;
}

function MessageSubscriptionInitializer() {
  useMessageSubscription();
  return null;
}

function NotificationMonitorInitializer() {
  useNotificationMonitor();
  return null;
}

function App() {
  // Initialize global error handler - deferred to not block initial render
  React.useEffect(() => {
    if (initializationState.errorHandler) return;
    initializationState.errorHandler = true;

    // Defer heavy error handler setup to idle time
    const initErrorHandler = () => {
      const globalErrorHandler = GlobalErrorHandler.getInstance();
      globalErrorHandler.initialize();
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(initErrorHandler, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    } else {
      const timeoutId = setTimeout(initErrorHandler, 100);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  // Store rehydration is now handled by StoreProvider
  // Club data initialization is handled by useStoreSubscriptions in ReplicationSyncProvider

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusProvider>
        <ReplicationSyncProvider autoSync={true} syncOnReconnect={true}>
          <StoreProvider>
            <AuthProvider>
              <UserDataInitializer />
              <AnnouncementSubscriptionInitializer />
              <MessageSubscriptionInitializer />
              <NotificationMonitorInitializer />
              <AudioSettingsProvider>
                <PanelProvider>
                  <ExhibitorOnboardingChecker>
                    <ErrorBoundary
                      level="page"
                      context="Application"
                      fallback={({ error, resetErrorBoundary }) => (
                        <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
                      )}
                    >
                      <AppShellMobileNavProvider>
                        <div className="min-h-screen transition-colors duration-300 bg-background text-foreground">
                          <PWAInstallBanner />
                          <AppHeader />
                          <NotificationCenter />
                          <AppToaster />
                          <ToastContainer />
                          <Outlet />
                        </div>
                      </AppShellMobileNavProvider>
                    </ErrorBoundary>
                  </ExhibitorOnboardingChecker>
                </PanelProvider>
              </AudioSettingsProvider>
            </AuthProvider>
          </StoreProvider>
        </ReplicationSyncProvider>
      </NetworkStatusProvider>
    </QueryClientProvider>
  );
}

export default App;
