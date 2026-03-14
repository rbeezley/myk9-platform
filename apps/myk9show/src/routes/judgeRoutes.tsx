/**
 * Judge Routes - Lazy loaded routes for judge functionality
 *
 * All /judge/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Scoring routes remain standalone (no sidebar — full screen for the dog).
 */

import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/context/AuthContext';
import { PageTransition } from '@/components/common/PageTransition';
import { UserRole } from '@/types/auth-types';
import { SuspenseWrapper } from './utils/SuspenseWrapper';

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
const JudgeStatsPage = lazy(() => import('@/pages/judge/JudgeStatsPage'));

/** Routes rendered INSIDE UnifiedAppLayout (with sidebar) */
export const JudgeSidebarRoutes = () => (
  <>
    <Route
      path="/judge/dashboard"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <JudgeDashboard />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/judge/stats"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <JudgeStatsPage />
            </PageTransition>
          </SuspenseWrapper>
        </ProtectedRoute>
      }
    />
    <Route
      path="/judge/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.STEWARD, UserRole.SITE_ADMIN]}>
          <SuspenseWrapper>
            <PageTransition>
              <JudgeCheckInDashboard />
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
  </>
);

/** Scoring routes — standalone, NO sidebar (full screen for the dog) */
export const JudgeScoringRoutes = () => (
  <>
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
