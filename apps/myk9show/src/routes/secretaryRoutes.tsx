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
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { useShowStore } from '@/store/showStore';

// Secretary Dashboard (replaces old PipelineDashboard)
const SecretaryDashboardPage = lazy(() =>
  import('@/pages/secretary/SecretaryDashboardPage').then(m => ({
    default: m.SecretaryDashboardPage,
  }))
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
const ShowWorkbenchPage = lazy(() =>
  import('@/pages/secretary/ShowWorkbenchPage').then(m => ({
    default: m.ShowWorkbenchPage,
  }))
);

const VolunteerSchedulingPage = lazy(
  () => import('@/pages/secretary/VolunteerSchedulingPage')
);
const ShowSettingsPage = lazy(() => import('@/pages/secretary/ShowSettingsPage'));
const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));
const ReportsPage = lazy(() => import('@/pages/secretary/ReportsPage'));
const ResultsSubmissionPage = lazy(() => import('@/pages/secretary/ResultsSubmissionPage'));
const SecretaryMessagesPage = lazy(() => import('@/features/messages/pages/SecretaryMessagesPage'));
// Scoring pages
const PaperScoresheetPage = lazy(() =>
  import('@/pages/scoring/PaperScoresheetPage').then(m => ({ default: m.PaperScoresheetPage }))
);
const ScoresheetPage = lazy(() =>
  import('@/pages/scoring/ScoresheetPage').then(m => ({ default: m.ScoresheetPage }))
);

const ShowEditRedirect = () => {
  const { showId } = useParams<{ showId: string }>();
  const navigate = useNavigate();
  useEffect(() => {
    navigate(`/shows/${showId}?edit=true`, { replace: true });
  }, [showId, navigate]);
  return null;
};

const UserDetailRedirect = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/people/${id}` : '/people'} replace />;
};

// Normalize the legacy /secretary/messages/:showId path to the canonical
// query-param form so deep-links from Show Desk still work.
const SecretaryMessagesShowIdRedirect = () => {
  const { showId } = useParams<{ showId: string }>();
  return (
    <Navigate
      to={showId ? `/secretary/messages?showId=${showId}` : '/secretary/messages'}
      replace
    />
  );
};

const LAST_SHOW_KEY = 'myk9show:entryMgmt:lastShowId';

function getLastShowId(): string {
  try {
    return localStorage.getItem(LAST_SHOW_KEY) || '';
  } catch {
    return '';
  }
}

function useSecretaryRedirectShowId(): { showId: string; isResolving: boolean } {
  const selectedShowId = useShowStore(s => s.selectedShowId);
  const shows = useShowStore(s => s.shows);
  const isLoading = useShowStore(s => s.isLoading);
  const onlyShowId = shows.length === 1 ? shows[0]?.id : undefined;
  const showId = selectedShowId || onlyShowId || getLastShowId();

  return {
    showId,
    isResolving: !showId && isLoading,
  };
}

const SecretaryShowPhaseRedirect = ({
  phase,
}: {
  phase: 'setup' | 'show-desk';
}) => {
  const { showId, isResolving } = useSecretaryRedirectShowId();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (!showId) {
    return <Navigate to="/secretary/dashboard" replace />;
  }

  const params = new URLSearchParams({ phase });

  return <Navigate to={`/secretary/shows/${showId}?${params.toString()}`} replace />;
};

const SecretaryIndexRedirect = () => {
  const { showId, isResolving } = useSecretaryRedirectShowId();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  return <Navigate to={showId ? `/secretary/shows/${showId}` : '/secretary/dashboard'} replace />;
};

/** All secretary routes — rendered inside UnifiedAppLayout */
export const SecretaryRoutes = () => (
  <>
    {/* Secretary management pages */}
    <Route
      path="/secretary"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryIndexRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/dashboard"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <SecretaryDashboardPage />
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
          <SecretaryShowPhaseRedirect phase="setup" />
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
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <Navigate to="/secretary/entries?tab=waitlist" replace />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/day-of"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryShowPhaseRedirect phase="show-desk" />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryShowPhaseRedirect phase="show-desk" />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/volunteers"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <VolunteerSchedulingPage />
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/volunteer-scheduling"
      element={<Navigate to="/secretary/volunteers" replace />}
    />
    <Route path="/secretary/tasks" element={<Navigate to="/secretary/dashboard" replace />} />
    <Route
      path="/secretary/shows/:showId"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ShowWorkbenchPage />
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
      path="/secretary/messages"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <SecretaryMessagesPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/messages/:showId"
      element={<SecretaryMessagesShowIdRedirect />}
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
      path="/people/:id"
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
    <Route path="/users/:id" element={<UserDetailRedirect />} />

    {/* Scoring — entry list and individual scoresheet */}
    <Route
      path="/scoring/classes/:classId/entries"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <PaperScoresheetPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/scoring/classes/:classId/entries/:entryId"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ScoresheetPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
  </>
);
