import React, { Suspense, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ScoresheetErrorBoundary } from './components/ScoresheetErrorBoundary';
import { PageLoader, ScoresheetLoader } from './components/LoadingSpinner';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
// UI components moved to MainLayout
import { useOneHandedMode } from './hooks/useOneHandedMode';
import { useAutoLogout } from './hooks/useAutoLogout';
import { usePushNotificationAutoSwitch } from './hooks/usePushNotificationAutoSwitch';
import { useOfflineQueueProcessor } from './hooks/useOfflineQueueProcessor';
import { useServiceWorkerMessages } from './hooks/useServiceWorkerMessages';
import { useAppInitialization } from './hooks/useAppInitialization';
import { useGlobalHaptic } from './hooks/useGlobalHaptic';
import { useAuth } from './contexts/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { subscriptionCleanup } from './services/subscriptionCleanup';
// Services moved to useAppInitialization hook
import { clearReplicationCaches } from './services/replication/initReplication';
import { logger } from './utils/logger';
import './utils/quickRecovery'; // Auto-setup recovery functions
// memoryLeakDetector auto-starts via its module initialization (dev mode only)

// Import unified container system
import './styles/containers.css';

// Eager load critical components
import { Login } from './pages/Login/Login';
import { Landing } from './pages/Landing/Landing';

// Debug components - only imported in development mode
// These expose internal tools that should never be accessible in production
const DatabaseTest = import.meta.env.DEV
  ? React.lazy(() => import('./components/DatabaseTest').then(m => ({ default: m.DatabaseTest })))
  : () => null;
const TestConnections = import.meta.env.DEV
  ? React.lazy(() => import('./pages/TestConnections').then(m => ({ default: m.TestConnections })))
  : () => null;
const MigrationTest = import.meta.env.DEV
  ? React.lazy(() => import('./pages/MigrationTest/MigrationTest').then(m => ({ default: m.MigrationTest })))
  : () => null;

// Lazy load pages for code splitting
const Home = React.lazy(() => import('./pages/Home/Home').then(module => ({ default: module.Home })));
const DogDetails = React.lazy(() => import('./pages/DogDetails/DogDetails').then(module => ({ default: module.DogDetails })));
const ClassList = React.lazy(() => import('./pages/ClassList/ClassList').then(module => ({ default: module.ClassList })));
const EntryList = React.lazy(() => import('./pages/EntryList/EntryList'));
const CombinedEntryList = React.lazy(() => import('./pages/EntryList/CombinedEntryList'));
const Announcements = React.lazy(() => import('./pages/Announcements/Announcements').then(module => ({ default: module.Announcements })));
const TVRunOrder = React.lazy(() => import('./pages/TVRunOrder/TVRunOrder').then(module => ({ default: module.TVRunOrder })));
const Results = React.lazy(() => import('./pages/Results').then(module => ({ default: module.Results })));
const StatusPopupDemo = React.lazy(() => import('./demo/StatusPopupDemo'));

// Lazy load scoresheets (grouped by organization for better chunking)
const UKCObedienceScoresheet = React.lazy(() =>
  import('./pages/scoresheets/UKC/UKCObedienceScoresheet').then(module => ({
    default: module.UKCObedienceScoresheet
  }))
);
const UKCRallyScoresheet = React.lazy(() =>
  import('./pages/scoresheets/UKC/UKCRallyScoresheet').then(module => ({
    default: module.UKCRallyScoresheet
  }))
);
const UKCNoseworkScoresheet = React.lazy(() =>
  import('./pages/scoresheets/UKC/UKCNoseworkScoresheet').then(module => ({
    default: module.UKCNoseworkScoresheet
  }))
);
const AKCScentWorkScoresheetRouter = React.lazy(() =>
  import('./pages/scoresheets/AKC/AKCScentWorkScoresheetRouter').then(module => ({
    default: module.AKCScentWorkScoresheetRouter
  }))
);
const AKCFastCatScoresheet = React.lazy(() =>
  import('./pages/scoresheets/AKC/AKCFastCatScoresheet').then(module => ({
    default: module.AKCFastCatScoresheet
  }))
);
const ASCAScentDetectionScoresheet = React.lazy(() =>
  import('./pages/scoresheets/ASCA/ASCAScentDetectionScoresheet').then(module => ({
    default: module.ASCAScentDetectionScoresheet
  }))
);
const TestScoresheet = React.lazy(() =>
  import('./components/TestScoresheet').then(module => ({
    default: module.TestScoresheet
  }))
);
const NationalsWireframe = React.lazy(() =>
  import('./components/wireframes/NationalsWireframe').then(module => ({
    default: module.NationalsWireframe
  }))
);
const Settings = React.lazy(() =>
  import('./pages/Settings/Settings').then(module => ({
    default: module.Settings
  }))
);
const Stats = React.lazy(() =>
  import('./pages/Stats/Stats').then(module => ({
    default: module.Stats
  }))
);
const ShowDetails = React.lazy(() =>
  import('./pages/ShowDetails/ShowDetails').then(module => ({
    default: module.ShowDetails
  }))
);
const PerformanceMetricsAdmin = React.lazy(() =>
  import('./pages/Admin/PerformanceMetricsAdmin').then(module => ({
    default: module.PerformanceMetricsAdmin
  }))
);
const AuditLog = React.lazy(() =>
  import('./pages/Admin/AuditLog').then(module => ({
    default: module.default
  }))
);
const TrialSecretary = React.lazy(() =>
  import('./pages/TrialSecretary/TrialSecretary').then(module => ({
    default: module.TrialSecretary
  }))
);

// Create a React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes (formerly cacheTime)
      retry: 1,                  // Retry once on failure
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      networkMode: 'always',     // Always run queries, even when offline (will use cached data)
    },
  },
});

// Create persister for React Query cache (stores to localStorage)
// This enables offline access to all React Query data
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'myK9Q-react-query-cache',
});

/**
 * Hook to detect show switches and clear caches
 * This is a defensive measure in addition to logout cache clearing
 * Handles edge cases where license key changes without full logout
 */
function useShowSwitchCacheCleanup(licenseKey: string | undefined) {
  const queryClient = useQueryClient();
  const previousLicenseKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Skip if no license key (user not logged in)
    if (!licenseKey) {
      previousLicenseKeyRef.current = null;
      return;
    }

    // Detect license key change (show switch)
    if (
      previousLicenseKeyRef.current !== null &&
      previousLicenseKeyRef.current !== licenseKey
    ) {
      logger.log(`[App] 🔄 Show switch detected: ${previousLicenseKeyRef.current} → ${licenseKey}`);

      // Clear React Query in-memory cache for old show
      // This removes queries with the old license key
      queryClient.removeQueries({
        predicate: (query) => {
          const key = query.queryKey;
          // Remove queries that include the old license key
          return Array.isArray(key) && key.includes(previousLicenseKeyRef.current);
        }
      });
      logger.log('[App] ✅ React Query cache cleared for old show');

      // Clear IndexedDB replication caches
      clearReplicationCaches().then(() => {
        logger.log('[App] ✅ IndexedDB caches cleared for show switch');
      }).catch((error) => {
        logger.error('[App] ⚠️ Failed to clear IndexedDB caches:', error);
      });
    }

    // Update tracked license key
    previousLicenseKeyRef.current = licenseKey;
  }, [licenseKey, queryClient]);
}

// Hook to handle route changes and cleanup subscriptions
function useRouteChangeCleanup() {
  const location = useLocation();
  const previousLocation = React.useRef(location.pathname);

  useEffect(() => {
    const fromRoute = previousLocation.current;
    const toRoute = location.pathname;

    if (fromRoute !== toRoute) {
      // Clean up stale subscriptions on route change
      subscriptionCleanup.cleanupOnRouteChange(fromRoute, toRoute);

      // Track navigation for intelligent prefetching
      (async () => {
        const { getReplicationManager } = await import('./services/replication');
        const manager = getReplicationManager();
        if (manager) {
          manager.trackNavigation(toRoute);
        }
      })();

      previousLocation.current = toRoute;
    }
  }, [location.pathname]);
}

// Component that needs to be inside AuthProvider to use auth context
function AppWithAuth() {
  const { showContext } = useAuth();

  // Apply one-handed mode globally
  useOneHandedMode();

  // Apply global haptic feedback for all button clicks
  useGlobalHaptic();

  // Apply auto-logout timer
  const autoLogout = useAutoLogout();

  // Auto-switch push notification subscription when license key changes
  usePushNotificationAutoSwitch(showContext?.licenseKey);

  // Clear caches when show/license key changes (defensive measure)
  useShowSwitchCacheCleanup(showContext?.licenseKey);

  // Handle service worker messages (notification clicks)
  useServiceWorkerMessages();

  // 🚀 OFFLINE-FIRST: Process offline queue when network returns
  // Automatically syncs pending scores to server when coming back online
  useOfflineQueueProcessor();

  // Clean up subscriptions on route changes
  useRouteChangeCleanup();

  // Initialize app (device detection, settings, analytics, notifications, etc.)
  // This hook handles all initialization logic with proper cleanup
  useAppInitialization();

  return (
    <MainLayout autoLogout={autoLogout}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading dashboard..." />}>
                <Home />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dog/:armband"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading dog details..." />}>
                <DogDetails />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/trial/:trialId/classes"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading classes..." />}>
                <ClassList />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/class/:classId/entries"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading entries..." />}>
                <EntryList />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/class/:classIdA/:classIdB/entries/combined"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading combined entries..." />}>
                <CombinedEntryList />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/announcements"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading announcements..." />}>
                <Announcements />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading settings..." />}>
                <Settings />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stats"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading statistics..." />}>
                <Stats />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stats/trial/:trialId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading trial statistics..." />}>
                <Stats />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/stats/trial/:trialId/class/:classId"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading class statistics..." />}>
                <Stats />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/show/:licenseKey"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading show info..." />}>
                <ShowDetails />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoresheet/ukc-obedience/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <UKCObedienceScoresheet />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoresheet/ukc-rally/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <UKCRallyScoresheet />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoresheet/ukc-nosework/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <UKCNoseworkScoresheet />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoresheet/akc-scent-work/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <AKCScentWorkScoresheetRouter />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/test/scoresheet"
          element={
            <ScoresheetErrorBoundary>
              <Suspense fallback={<ScoresheetLoader />}>
                <TestScoresheet />
              </Suspense>
            </ScoresheetErrorBoundary>
          }
        />
        <Route
          path="/wireframe/nationals"
          element={
            <Suspense fallback={<PageLoader message="Loading wireframe..." />}>
              <NationalsWireframe />
            </Suspense>
          }
        />
        <Route
          path="/scoresheet/akc-fastcat/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <AKCFastCatScoresheet />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scoresheet/asca-scent-detection/:classId/:entryId"
          element={
            <ProtectedRoute>
              <ScoresheetErrorBoundary>
                <Suspense fallback={<ScoresheetLoader />}>
                  <ASCAScentDetectionScoresheet />
                </Suspense>
              </ScoresheetErrorBoundary>
            </ProtectedRoute>
          }
        />
        {/* Debug routes - only available in development mode */}
        {import.meta.env.DEV && (
          <>
            <Route path="/debug" element={<Suspense fallback={<PageLoader message="Loading..." />}><DatabaseTest /></Suspense>} />
            <Route path="/test-connections" element={<Suspense fallback={<PageLoader message="Loading..." />}><TestConnections /></Suspense>} />
            <Route path="/migration-test" element={<Suspense fallback={<PageLoader message="Loading..." />}><MigrationTest /></Suspense>} />
            <Route
              path="/demo/status-popup"
              element={
                <Suspense fallback={<PageLoader message="Loading demo..." />}>
                  <StatusPopupDemo />
                </Suspense>
              }
            />
          </>
        )}
        <Route
          path="/tv/:licenseKey"
          element={
            <Suspense fallback={<PageLoader message="Loading TV Display..." />}>
              <TVRunOrder />
            </Suspense>
          }
        />
        <Route
          path="/results"
          element={
            <Suspense fallback={<PageLoader message="Loading Results..." />}>
              <Results />
            </Suspense>
          }
        />
        <Route
          path="/results/:licenseKey"
          element={
            <Suspense fallback={<PageLoader message="Loading Results..." />}>
              <Results />
            </Suspense>
          }
        />
        <Route
          path="/admin/metrics"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading Performance Metrics..." />}>
                <PerformanceMetricsAdmin />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/:licenseKey/audit-log"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading Audit Log..." />}>
                <AuditLog />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/secretary"
          element={
            <ProtectedRoute>
              <Suspense fallback={<PageLoader message="Loading Secretary Tools..." />}>
                <TrialSecretary />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Landing />} />
      </Routes>
    </MainLayout>
  );
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister }}
    >
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <ErrorBoundary>
              <AppWithAuth />
            </ErrorBoundary>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </PersistQueryClientProvider>
  );
}

export default App;