/**
 * Secretary Routes - Lazy loaded routes for secretary functionality
 *
 * Uses SecretaryLayout with collapsible sidebar for all /secretary/* pages.
 * Standalone routes (different URL prefix) render without the layout.
 */

import { lazy, useEffect } from 'react';
import { Route, useParams, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { SecretaryLayout } from '@/components/secretary/SecretaryLayout';

// Mission Control (replaces old SecretaryDashboard)
const SecretaryDashboard = lazy(() => import('@/features/pipeline/components/PipelineDashboard'));
const TrialPipelineDetail = lazy(() => import('@/features/pipeline/components/TrialPipelineDetail'));
// Lazy import for better performance
const CreateShowPage = lazy(() => import('@/pages/secretary/CreateShowPage'));
const ShowCreationWizardPage = lazy(() => import('@/pages/secretary/ShowCreationWizardPage'));
const ClassCreationPage = lazy(() => import('@/pages/secretary/ClassCreationPage').then(m => ({ default: m.ClassCreationPage })));
const ClassManagementPage = lazy(() => import('@/pages/secretary/ClassManagementPage').then(m => ({ default: m.ClassManagementPage })));
const RunOrderPage = lazy(() => import('@/pages/secretary/RunOrderPage').then(m => ({ default: m.RunOrderPage })));

// Secretary components
const SecretaryClassDashboard = lazy(() => import('@/components/secretary/SecretaryClassDashboard').then(m => ({ default: m.SecretaryClassDashboard })));
const SyncDashboardPage = lazy(() => import('@/pages/sync/SyncDashboardPage').then(m => ({ default: m.SyncDashboardPage })));

// Entry management
const EntryManagementPage = lazy(() => import('@/pages/secretary/EntryManagementPage').catch(() => ({ default: () => <div>Entry Management Coming Soon</div> })));
const WaitlistManagementPage = lazy(() => import('@/pages/secretary/WaitlistManagementPage'));
const DayOfOperationsPage = lazy(() => import('@/pages/secretary/DayOfOperationsPage'));

// Shared pages rendered within secretary layout
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const BrowsePeoplePage = lazy(() => import('@/pages/BrowsePeoplePage'));
const BrowseDogsPage = lazy(() => import('@/pages/BrowseDogsPage'));
const BrowseClubsPage = lazy(() => import('@/pages/BrowseClubsPage'));
const CalendarPage = lazy(() => import('@/pages/CalendarPage'));

const ShowEditRedirect = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/shows/${showId}?edit=true`, { replace: true });
  }, [showId, navigate]);
  return null;
};

export const SecretaryRoutes = () => (
  <>
    {/* Secretary Layout route — persistent collapsible sidebar for /secretary/* */}
    <Route path="/secretary" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SecretaryLayout />
      </ProtectedRoute>
    }>
      <Route path="dashboard" element={
        <SuspenseWrapper>
          <PageTransition><SecretaryDashboard /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="pipeline/:trialId" element={
        <SuspenseWrapper>
          <PageTransition><TrialPipelineDetail /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="create-show" element={
        <SuspenseWrapper>
          <PageTransition><CreateShowPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="create-show/wizard" element={
        <SuspenseWrapper>
          <PageTransition><ShowCreationWizardPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="run-order" element={
        <SuspenseWrapper>
          <PageTransition><RunOrderPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="entries" element={
        <SuspenseWrapper>
          <PageTransition><EntryManagementPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="waitlist" element={
        <SuspenseWrapper>
          <PageTransition><WaitlistManagementPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="day-of" element={
        <SuspenseWrapper>
          <PageTransition><DayOfOperationsPage /></PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="shows/:showId/edit" element={
        <SuspenseWrapper>
          <ShowEditRedirect />
        </SuspenseWrapper>
      } />

      {/* Shared pages — strip standalone padding/min-height so they fit the sidebar layout */}
      <Route path="shows" element={
        <SuspenseWrapper>
          <PageTransition>
            <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
              <BrowseShowsPage />
            </div>
          </PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="users" element={
        <SuspenseWrapper>
          <PageTransition>
            <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
              <BrowsePeoplePage />
            </div>
          </PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="dogs" element={
        <SuspenseWrapper>
          <PageTransition>
            <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
              <BrowseDogsPage />
            </div>
          </PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="clubs" element={
        <SuspenseWrapper>
          <PageTransition>
            <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
              <BrowseClubsPage />
            </div>
          </PageTransition>
        </SuspenseWrapper>
      } />
      <Route path="calendar" element={
        <SuspenseWrapper>
          <PageTransition>
            <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
              <CalendarPage />
            </div>
          </PageTransition>
        </SuspenseWrapper>
      } />
    </Route>

    {/* Standalone routes — different URL prefix, no secretary sidebar */}
    <Route path="/trials/:trialId/classes/create" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ClassCreationPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/trials/:trialId/classes" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ClassManagementPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/shows/:showId/trials/:trialId/classes/:classId/secretary" element={
      <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><SecretaryClassDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/sync/dashboard" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><SyncDashboardPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
  </>
);