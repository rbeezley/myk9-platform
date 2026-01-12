import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { optimizeQueryCache, setupQueryPerformanceMonitoring, prefetchCriticalData } from '@/utils/performanceOptimizations';

// Home page loaded synchronously for LCP optimization
import Home from './pages/Home';
import { logger } from '@/services/LoggingService';

// Lazy load non-critical pages to improve initial bundle size
const PricingPage = React.lazy(() => import('./pages/PricingPage'));
const SignInPage = React.lazy(() => import('./pages/SignInPage'));
const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
const TestPanelPage = React.lazy(() => import('./pages/TestPanelPage'));

// Organized route groups
import { AdminRoutes } from './routes/adminRoutes';
import { JudgeRoutes } from './routes/judgeRoutes';
import { SecretaryRoutes } from './routes/secretaryRoutes';
import { PublicRoutes } from './routes/publicRoutes';

// Components
import AppHeader from './components/layout/AppHeader';
import ErrorBoundary from './components/common/ErrorBoundary';
import { PageTransition } from './components/common/PageTransition';
import { NetworkStatusProvider } from './components/common/NetworkStatusProvider';

// Context
import { AuthProvider } from './context/AuthContext';
import { AudioSettingsProvider } from './contexts/AudioSettingsContext';
import { FormErrorProvider } from './providers/FormErrorProvider';
import { StoreProvider } from './providers/StoreProvider';
import { ReplicationSyncProvider } from './providers/ReplicationSyncProvider';

// Panel System
import { PanelProvider } from './components/panels/PanelContext';

// Alert System
import { AlertInitializer } from './components/alerts';

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

// Performance monitoring component - development only
const PerformanceStats = React.lazy(() => import('./components/dev/PerformanceStats').then(m => ({ default: m.PerformanceStats })));


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

// Error fallback component
const ErrorFallback = ({
  error,
  resetErrorBoundary
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

function App() {

  // Initialize global error handler (removed preloading for better startup performance)
  React.useEffect(() => {
    const globalErrorHandler = GlobalErrorHandler.getInstance();
    globalErrorHandler.initialize();

    return () => {
      globalErrorHandler.destroy();
    };
  }, []);

  // Initialize user data from database
  React.useEffect(() => {
    const initializeUserData = async () => {
      try {
        const { useUserStore } = await import('./store/userStore');
        const { loadUsers } = useUserStore.getState();
        await loadUsers();
      } catch (error) {
        logger.error('Failed to initialize user data:', 'app', {}, error as Error);
      }
    };
    
    initializeUserData();
  }, []);

  // Initialize club data from database
  React.useEffect(() => {
    const initializeClubData = async () => {
      try {
        const { useClubStore } = await import('./store/clubStore');
        const { loadClubs } = useClubStore.getState();
        await loadClubs();
      } catch (error) {
        logger.error('Failed to initialize club data:', 'app', {}, error as Error);
      }
    };
    
    initializeClubData();
  }, []);

  // Store rehydration is now handled by StoreProvider

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusProvider>
        <ReplicationSyncProvider autoSync={true} syncOnReconnect={true}>
          <StoreProvider>
            <AuthProvider>
              <AudioSettingsProvider>
                <FormErrorProvider>
                  <PanelProvider>
                    <AlertInitializer>
                    <ErrorBoundary 
                      level="page"
                      context="Application"
                      fallback={({ error, resetErrorBoundary }) => (
                        <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
                      )}
                    >
                      <div className="min-h-screen transition-colors duration-300 bg-background text-foreground">
                        <AppHeader />
                        {/* Development performance monitoring */}
                        {import.meta.env.DEV && (
                          <Suspense fallback={null}>
                            <PerformanceStats />
                          </Suspense>
                        )}
                        <Routes>
                          {/* Public routes */}
                          <Route path="/" element={<PageTransition><Home /></PageTransition>} />
                          <Route path="/pricing-page" element={
                            <PageTransition>
                              <Suspense fallback={<PageLoadingFallback />}>
                                <PricingPage />
                              </Suspense>
                            </PageTransition>
                          } />
                          <Route path="/sign-in" element={
                            <PageTransition>
                              <Suspense fallback={<PageLoadingFallback />}>
                                <SignInPage />
                              </Suspense>
                            </PageTransition>
                          } />
                          <Route path="/sign-up" element={
                            <PageTransition>
                              <Suspense fallback={<PageLoadingFallback />}>
                                <SignUpPage />
                              </Suspense>
                            </PageTransition>
                          } />
                          
                          {/* Test page for SlideOverPanel components - Phase 2 */}
                          <Route path="/test-panels" element={
                            <PageTransition>
                              <Suspense fallback={<PageLoadingFallback />}>
                                <TestPanelPage />
                              </Suspense>
                            </PageTransition>
                          } />
                          
                          {/* Organized route groups */}
                          {AdminRoutes()}
                          {JudgeRoutes()}
                          {SecretaryRoutes()}
                          {PublicRoutes()}
                        </Routes>
                      </div>
                      
                    </ErrorBoundary>
                  </AlertInitializer>
                </PanelProvider>
              </FormErrorProvider>
              </AudioSettingsProvider>
            </AuthProvider>
          </StoreProvider>
        </ReplicationSyncProvider>
      </NetworkStatusProvider>
    </QueryClientProvider>
  );
}

export default App;