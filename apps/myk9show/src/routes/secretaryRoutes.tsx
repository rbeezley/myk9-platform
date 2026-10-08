/**
 * Secretary Routes - Lazy loaded routes for secretary functionality
 *
 * All /secretary/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Standalone routes (class management, sync) also render inside the unified layout.
 */

import { lazy, useEffect } from 'react';
import { Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { LegacyTrialClassCreateRedirect } from './LegacyClassCreateRedirect';
import { LegacyTrialClassManagementRedirect } from './LegacyClassManagementRedirect';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import { UserRole } from '@/types/auth-types';
import { CREATE_SHOW_WIZARD_ROLES } from './createShowWizardAccess';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { useShowStore } from '@/store/showStore';
import { useToastStore } from '@/store/toastStore';
import { LegacySecretaryShowRedirect } from '@/routes/showRouteRedirects';
import { getEntryManagementHref } from '@/features/entry-operations/entryAttentionRoutes';

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
// Secretary components
const SecretaryClassDashboard = lazy(() =>
  import('@/components/secretary/SecretaryClassDashboard').then(m => ({
    default: m.SecretaryClassDashboard,
  }))
);

// People pages
const PeopleMasterDetailPage = lazy(() => import('@/pages/PeopleMasterDetailPage'));

const RegistrationWizardPage = lazy(() => import('@/pages/RegistrationWizardPage'));

const VolunteerSchedulingPage = lazy(() => import('@/pages/secretary/VolunteerSchedulingPage'));
const ShowSettingsPage = lazy(() => import('@/pages/secretary/ShowSettingsPage'));
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
  const { search } = useLocation();

  if (!showId) {
    return <Navigate to="/shows" replace />;
  }

  const searchParams = new URLSearchParams(search);
  searchParams.set('edit', 'true');

  return <Navigate to={`/shows/${showId}?${searchParams.toString()}`} replace />;
};

const peopleRouteElement = (
  <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
    <SuspenseWrapper>
      <PeopleMasterDetailPage />
    </SuspenseWrapper>
  </ProtectedRoute>
);

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

// Redirects /secretary/entries/:showId? to the show-scoped entry management route.
// Preserves location.search so filters like ?entryTab=pending survive the redirect.
const SecretaryEntriesRedirect = () => {
  const { showId: paramShowId } = useParams<{ showId?: string }>();
  const { showId: storeShowId, isResolving } = useSecretaryRedirectShowId();
  const resolvedShowId = paramShowId || storeShowId;
  const { search } = useLocation();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (resolvedShowId) {
    return <Navigate to={`/shows/${resolvedShowId}/entries${search}`} replace />;
  }

  return <Navigate to="/secretary/dashboard" replace />;
};

const SecretaryCompatibilityRedirect = ({
  to,
  toastId,
  toastTitle,
  toastBody,
}: {
  to: string;
  toastId: string;
  toastTitle: string;
  toastBody: string;
}) => {
  const addToast = useToastStore(s => s.addToast);
  useEffect(() => {
    addToast({
      id: toastId,
      type: 'announcement',
      title: toastTitle,
      body: toastBody,
      priority: 'normal',
      timestamp: Date.now(),
    });
  }, [addToast, toastBody, toastId, toastTitle]);
  return <Navigate to={to} replace />;
};

// Legacy standalone routes are compatibility aliases, not missing pages. The
// dashboard owns personal tasks; show-scoped operational work stays in the
// show's workbench. Every fallback explains the destination so a secretary
// does not experience a silent redirect.
const SecretaryNoContextRedirect = () => (
  <SecretaryCompatibilityRedirect
    to="/secretary/dashboard"
    toastId="no-show-context"
    toastTitle="Select a show to continue"
    toastBody="This secretary task needs a show. Choose one from your dashboard."
  />
);

const SecretaryWaitlistRedirect = () => {
  const { showId, isResolving } = useSecretaryRedirectShowId();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (showId) {
    return (
      <SecretaryCompatibilityRedirect
        to={getEntryManagementHref({ showId, tab: 'waitlist' })}
        toastId="waitlist-moved"
        toastTitle="Waitlist moved"
        toastBody="Waitlist work now lives in Entry Forms for this show."
      />
    );
  }

  return (
    <SecretaryCompatibilityRedirect
      to="/secretary/dashboard"
      toastId="waitlist-no-show-context"
      toastTitle="Select a show to continue"
      toastBody="Waitlist work lives in Entry Forms inside a show."
    />
  );
};

/** Old secretary show URLs: Setup and Show Day are the show home now (MYK9-957). */
const SecretaryShowRedirect = () => {
  const { showId, isResolving } = useSecretaryRedirectShowId();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  if (!showId) {
    return <Navigate to="/secretary/dashboard" replace />;
  }

  return <Navigate to={`/shows/${showId}`} replace />;
};

const SecretaryIndexRedirect = () => {
  const { showId, isResolving } = useSecretaryRedirectShowId();

  if (isResolving) {
    return <LoadingSkeleton variant="cards" count={2} />;
  }

  return <Navigate to={showId ? `/shows/${showId}` : '/secretary/dashboard'} replace />;
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
        <ProtectedRoute requiredRole={[...CREATE_SHOW_WIZARD_ROLES]}>
          <Navigate to="/secretary/create-show/wizard" replace />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/create-show/wizard"
      element={
        <ProtectedRoute requiredRole={[...CREATE_SHOW_WIZARD_ROLES]}>
          <SuspenseWrapper>
            <PageTransition>
              <ShowCreationWizardPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Legacy phase redirects — now map to show sub-routes */}
    <Route
      path="/secretary/run-order"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryShowRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/day-of"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryShowRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryShowRedirect />
        </ProtectedRoute>
      }
    />

    {/* Legacy standalone routes — redirect to dashboard (no show context available) */}
    <Route
      path="/secretary/entries/:showId?"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryEntriesRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/reports"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryNoContextRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/results-control"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryNoContextRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/secretary/results-submission"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryNoContextRedirect />
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
          <SecretaryWaitlistRedirect />
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
    <Route
      path="/secretary/tasks"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SecretaryCompatibilityRedirect
            to="/secretary/dashboard"
            toastId="tasks-moved"
            toastTitle="Tasks moved"
            toastBody="Personal tasks now live on your secretary dashboard."
          />
        </ProtectedRoute>
      }
    />

    {/* Legacy secretary show routes — canonical management lives under /shows/:id/* */}
    <Route
      path="/secretary/shows/:showId"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <LegacySecretaryShowRedirect />
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
    <Route
      path="/secretary/shows/:showId/*"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <LegacySecretaryShowRedirect />
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

    {/* Class management (previously standalone, now inside unified layout) */}
    <Route path="/trials/:trialId/classes/create" element={<LegacyTrialClassCreateRedirect />} />
    <Route
      path="/trials/:trialId/classes"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <LegacyTrialClassManagementRedirect />
        </ProtectedRoute>
      }
    />
    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId/secretary"
      element={
        <ProtectedRoute requiredRole={[UserRole.SECRETARY, UserRole.JUDGE, UserRole.SITE_ADMIN]}>
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
        <ProtectedRoute
          requiredRole={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
        >
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
      element={
        <ProtectedRoute
          requiredRole={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
        >
          <SecretaryMessagesShowIdRedirect />
        </ProtectedRoute>
      }
    />

    {/* People — browse and detail, accessible to secretaries and site admins */}
    {/* Both paths render the same element at the same place in the tree, so React keeps the list
        mounted when the person changes (scroll, filters); the page applies PageTransition to the
        person only. Two static declarations, not `/people/:id?`, because the route registry and
        its tests read exact paths. */}
    <Route path="/people" element={peopleRouteElement} />
    <Route path="/people/:id" element={peopleRouteElement} />
    <Route path="/users" element={<Navigate to="/people" replace />} />
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
