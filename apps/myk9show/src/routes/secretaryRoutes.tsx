/**
 * Secretary Routes - Lazy loaded routes for secretary functionality
 *
 * All /secretary/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Standalone routes (class management, sync) also render inside the unified layout.
 */

import { lazy, useEffect } from 'react';
import { Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

// Mission Control (replaces old SecretaryDashboard)
const PipelineDashboardPage = lazy(
  () => import('@/features/pipeline/components/PipelineDashboard')
);
const TrialPipelineDetail = lazy(
  () => import('@/features/pipeline/components/TrialPipelineDetail')
);
const ShowCreationWizardPage = lazy(() => import('@/pages/secretary/ShowCreationWizardPage'));
const ClassCreationPage = lazy(() =>
  import('@/pages/secretary/ClassCreationPage').then(m => ({ default: m.ClassCreationPage }))
);
const ClassManagementPage = lazy(() =>
  import('@/pages/secretary/ClassManagementPage').then(m => ({ default: m.ClassManagementPage }))
);
const RunOrderPage = lazy(() =>
  import('@/pages/secretary/RunOrderPage').then(m => ({ default: m.RunOrderPage }))
);

// Secretary components
const SecretaryClassDashboard = lazy(() =>
  import('@/components/secretary/SecretaryClassDashboard').then(m => ({
    default: m.SecretaryClassDashboard,
  }))
);

// People pages
const BrowsePeoplePage = lazy(() => import('@/pages/BrowsePeoplePage'));
const PersonDetailPage = lazy(() => import('@/pages/PersonDetailPage'));
// Entry management
const EntryManagementPage = lazy(() =>
  import('@/pages/secretary/EntryManagementPage').catch(() => ({
    default: () => <div>Entry Management Coming Soon</div>,
  }))
);
const RegistrationWizardPage = lazy(() => import('@/pages/RegistrationWizardPage'));
const DayOfOperationsPage = lazy(() => import('@/pages/secretary/DayOfOperationsPage'));
const SecretaryTasksPage = lazy(() => import('@/pages/secretary/SecretaryTasksPage'));
const ShowSettingsPage = lazy(() => import('@/pages/secretary/ShowSettingsPage'));
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
const ResultsSubmissionPage = lazy(() => import('@/pages/secretary/ResultsSubmissionPage'));
const VolunteerSchedulingPage = lazy(() => import('@/pages/secretary/VolunteerSchedulingPage'));
const SecretaryMessagesPage = lazy(() => import('@/features/messages/pages/SecretaryMessagesPage'));

const ShowEditRedirect = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/shows/${showId}?edit=true`, { replace: true });
  }, [showId, navigate]);
  return null;
};

/** All secretary routes — rendered inside UnifiedAppLayout */
export const SecretaryRoutes = () => (
  <>
    {/* Secretary management pages */}
    <Route
      path="/secretary/dashboard"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <PipelineDashboardPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/pipeline/:trialId"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <TrialPipelineDetail />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/create-show"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <Navigate to="/secretary/create-show/wizard" replace />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/create-show/wizard"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ShowCreationWizardPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/run-order"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <RunOrderPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/entries/:showId?"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <EntryManagementPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/register/:showId"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <RegistrationWizardPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/waitlist"
      element={<Navigate to="/secretary/entries?tab=waitlist" replace />}
    />
    <Route
      path="/secretary/day-of"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <DayOfOperationsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <Navigate to="/secretary/day-of?tab=check-in" replace />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/volunteers"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <VolunteerSchedulingPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/tasks"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <SecretaryTasksPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/settings"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ShowSettingsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/results-control"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ResultsControlPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/reports"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ReportsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/results-submission"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ResultsSubmissionPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/shows/:showId/edit"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <ShowEditRedirect />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Class management (previously standalone, now inside unified layout) */}
    <Route
      path="/trials/:trialId/classes/create"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ClassCreationPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/trials/:trialId/classes"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ClassManagementPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId/secretary"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <SecretaryClassDashboard />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/messages/:showId?"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <SecretaryMessagesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* People — browse and detail, accessible to secretaries and site admins */}
    <Route
      path="/people"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <BrowsePeoplePage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route path="/users" element={<Navigate to="/people" replace />} />
    <Route
      path="/users/:id"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <PersonDetailPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
  </>
);
