/**
 * Judge Routes - Lazy loaded routes for judge functionality
 *
 * All /judge/* pages render inside UnifiedAppLayout (sidebar provided by parent).
 * Scoring is myK9Q's domain — no scoring routes here.
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
