/**
 * Judge Routes - Lazy loaded routes for judge functionality
 *
 * Uses JudgeLayout with collapsible sidebar for all /judge/* pages.
 * Scoring routes remain standalone (no sidebar — full screen for the dog).
 */

import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';
import { JudgeLayout } from '@/components/judge/JudgeLayout';

/** Strips standalone page chrome so pages fit inside sidebar layout */
const EmbeddedPageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="[&_.min-h-screen]:min-h-0 [&_.min-h-screen]:pt-0 [&_.min-h-screen]:pb-0 [&_.container]:py-4 [&_.container]:max-w-none">
    {children}
  </div>
);

// Judge page lazy imports
const JudgeDashboard = lazy(() => import('@/pages/JudgeDashboard'));
const JudgeCheckInDashboard = lazy(() => import('@/pages/judge/JudgeCheckInDashboard'));
const JudgeScoringPage = lazy(() => import('@/pages/JudgeScoringPage'));

// Judge components
const JudgeClassInterface = lazy(() =>
  import('@/components/scoring/JudgeClassInterface').then(m => ({
    default: m.JudgeClassInterface,
  }))
);

// Scoring pages (using shared hooks from @myk9/scoring-ui)
const ScoringEntryListPage = lazy(() => import('@/pages/scoring/ScoringEntryListPage'));
const ScoresheetPage = lazy(() => import('@/pages/scoring/ScoresheetPage'));

// Results and analytics for judges
const ResultEntryDashboard = lazy(() => import('@/pages/ResultEntryDashboard'));

// Shared pages rendered within judge layout
const BrowseShowsPage = lazy(() => import('@/pages/BrowseShowsPage'));
const BrowsePeoplePage = lazy(() => import('@/pages/BrowsePeoplePage'));

export const JudgeRoutes = () => (
  <>
    {/* Judge Layout route — persistent collapsible sidebar for /judge/* */}
    <Route
      path="/judge"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SITE_ADMIN]}>
          <JudgeLayout />
        </ProtectedRoute>
      }
    >
      <Route
        path="dashboard"
        element={
          <SuspenseWrapper>
            <PageTransition>
              <JudgeDashboard />
            </PageTransition>
          </SuspenseWrapper>
        }
      />
      <Route
        path="check-in"
        element={
          <ProtectedRoute
            requiredRole={[UserRole.JUDGE, UserRole.GATE_STEWARD, UserRole.SITE_ADMIN]}
          >
            <SuspenseWrapper>
              <PageTransition>
                <JudgeCheckInDashboard />
              </PageTransition>
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="shows"
        element={
          <SuspenseWrapper>
            <PageTransition>
              <EmbeddedPageWrapper>
                <BrowseShowsPage />
              </EmbeddedPageWrapper>
            </PageTransition>
          </SuspenseWrapper>
        }
      />
      <Route
        path="people"
        element={
          <SuspenseWrapper>
            <PageTransition>
              <EmbeddedPageWrapper>
                <BrowsePeoplePage />
              </EmbeddedPageWrapper>
            </PageTransition>
          </SuspenseWrapper>
        }
      />
    </Route>

    {/* Scoring routes — standalone, NO sidebar (full screen for the dog) */}
    <Route
      path="/judge-scoring"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <JudgeScoringPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId/judge"
      element={
        <ProtectedRoute
          requiredRole={[
            UserRole.JUDGE,
            UserRole.SECRETARY,
            UserRole.CLUB_ADMIN,
            UserRole.SITE_ADMIN,
          ]}
        >
          <SuspenseWrapper>
            <PageTransition>
              <JudgeClassInterface />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/shows/:showId/trials/:trialId/classes/:classId/judge/:entryId"
      element={
        <ProtectedRoute
          requiredRole={[
            UserRole.JUDGE,
            UserRole.SECRETARY,
            UserRole.CLUB_ADMIN,
            UserRole.SITE_ADMIN,
          ]}
        >
          <SuspenseWrapper>
            <PageTransition>
              <JudgeClassInterface />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Results Management */}
    <Route
      path="/results/dashboard"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ResultEntryDashboard />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    {/* Scoring Routes (using shared @myk9/scoring-ui hooks) */}
    <Route
      path="/scoring/classes/:classId/entries"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <ScoringEntryListPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />

    <Route
      path="/scoring/classes/:classId/entries/:entryId"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
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
