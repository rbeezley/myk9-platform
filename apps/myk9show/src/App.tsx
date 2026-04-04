import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  optimizeQueryCache,
  setupQueryPerformanceMonitoring,
  prefetchCriticalData,
} from '@/utils/performanceOptimizations';

// Home page loaded synchronously for LCP optimization
import Home from './pages/Home';
import { logger } from '@/services/LoggingService';

// Lazy load non-critical pages to improve initial bundle size
const PricingPage = React.lazy(() => import('./pages/PricingPage'));
const SignInPage = React.lazy(() => import('./pages/SignInPage'));
const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const AuthCallbackPage = React.lazy(() => import('./pages/AuthCallbackPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

// Organized route groups
import { AdminRoutes } from './routes/adminRoutes';
import { JudgeSidebarRoutes } from './routes/judgeRoutes';
import { SecretaryRoutes } from './routes/secretaryRoutes';
import { ClubAdminRoutes } from './routes/clubAdminRoutes';
import { PublicRoutes } from './routes/publicRoutes';

// Unified layout
import { UnifiedAppLayout } from './components/layout/UnifiedAppLayout';

// Components
import AppHeader from './components/layout/AppHeader';
import ErrorBoundary from './components/common/ErrorBoundary';
import { PageTransition } from './components/common/PageTransition';
import { NetworkStatusProvider } from './components/common/NetworkStatusProvider';

// Context
import { AuthProvider } from './context/AuthContext';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useAnnouncementSubscription } from '@/hooks/useAnnouncementSubscription';
import { useMessageSubscription } from '@/hooks/useMessageSubscription';
import { useNotificationMonitor } from '@/hooks/useNotificationMonitor';
import { AudioSettingsProvider } from './contexts/AudioSettingsContext';
import { StoreProvider } from './providers/StoreProvider';
import { ReplicationSyncProvider } from './providers/ReplicationSyncProvider';

// Panel System
import { PanelProvider } from './components/panels/PanelContext';

// Alert System
import { AlertInitializer } from './components/alerts';

// Notification System
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

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

// Page loading fallback component
const PageLoadingFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
    <p className="text-sm text-muted-foreground">Loading page...</p>
  </div>
);

// Redirect authenticated users to /shows, show landing page for guests
const HomeRedirect = () => {
  const { user, loading } = useAuthContext();
  if (loading) return <PageLoadingFallback />;
  if (user) {
    const params = new URLSearchParams(window.location.search);
    if (params.get('wizard') === 'true') {
      return <Navigate to="/secretary/create-show/wizard" replace />;
    }
    // Allow authenticated users to see landing page for onboarding form
    if (params.get('onboarding') === 'true') {
      return <Home />;
    }
    return <Navigate to="/shows" replace />;
  }
  return <Home />;
};

// Error fallback component
const ErrorFallback = ({
  error,
  resetErrorBoundary,
}: {
  error: Error | null;
  resetErrorBoundary: () => void;
}) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full p-6 bg-card rounded-lg shadow-md">
        <div className="flex flex-col items-center text-center">
          <div className="p-3 bg-destructive/10 rounded-full mb-4">
            <AlertCircle className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">
            {error?.message || 'An unexpected error occurred'}
          </p>
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
  const { user } = useAuthContext();

  React.useEffect(() => {
    if (!user) return;

    const initializeUserData = async () => {
      try {
        const { useUserStore } = await import('./store/userStore');
        const store = useUserStore.getState();
        if (store.users.length === 0) {
          await store.loadUsers();
        }
      } catch (error) {
        logger.error('Failed to load user data after auth:', 'app', {}, error as Error);
      }
    };

    initializeUserData();
  }, [user]);

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

function ConditionalAppHeader() {
  return <AppHeader />;
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
                  <AlertInitializer>
                    <ExhibitorOnboardingChecker>
                      <ErrorBoundary
                        level="page"
                        context="Application"
                        fallback={({ error, resetErrorBoundary }) => (
                          <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
                        )}
                      >
                        <div className="min-h-screen transition-colors duration-300 bg-background text-foreground">
                          <PWAInstallBanner />
                          <ConditionalAppHeader />
                          <NotificationCenter />
                          <Routes>
                            {/* Public routes */}
                            <Route
                              path="/"
                              element={
                                <PageTransition>
                                  <HomeRedirect />
                                </PageTransition>
                              }
                            />
                            <Route
                              path="/pricing-page"
                              element={
                                <PageTransition>
                                  <Suspense fallback={<PageLoadingFallback />}>
                                    <PricingPage />
                                  </Suspense>
                                </PageTransition>
                              }
                            />
                            <Route
                              path="/sign-in"
                              element={
                                <PageTransition>
                                  <Suspense fallback={<PageLoadingFallback />}>
                                    <SignInPage />
                                  </Suspense>
                                </PageTransition>
                              }
                            />
                            <Route
                              path="/sign-up"
                              element={
                                <PageTransition>
                                  <Suspense fallback={<PageLoadingFallback />}>
                                    <SignUpPage />
                                  </Suspense>
                                </PageTransition>
                              }
                            />
                            <Route
                              path="/forgot-password"
                              element={
                                <PageTransition>
                                  <Suspense fallback={<PageLoadingFallback />}>
                                    <ForgotPasswordPage />
                                  </Suspense>
                                </PageTransition>
                              }
                            />

                            <Route
                              path="/auth/callback"
                              element={
                                <Suspense fallback={<PageLoadingFallback />}>
                                  <AuthCallbackPage />
                                </Suspense>
                              }
                            />
                            <Route
                              path="/reset-password"
                              element={
                                <Suspense fallback={<PageLoadingFallback />}>
                                  <ResetPasswordPage />
                                </Suspense>
                              }
                            />

                            {/* All other routes — inside unified sidebar layout */}
                            <Route element={<UnifiedAppLayout />}>
                              {AdminRoutes()}
                              {JudgeSidebarRoutes()}
                              {SecretaryRoutes()}
                              {ClubAdminRoutes()}
                              {PublicRoutes()}
                            </Route>

                            {/* 404 catch-all */}
                            <Route
                              path="*"
                              element={
                                <PageTransition>
                                  <Suspense fallback={<PageLoadingFallback />}>
                                    <NotFoundPage />
                                  </Suspense>
                                </PageTransition>
                              }
                            />
                          </Routes>
                        </div>
                      </ErrorBoundary>
                    </ExhibitorOnboardingChecker>
                  </AlertInitializer>
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
