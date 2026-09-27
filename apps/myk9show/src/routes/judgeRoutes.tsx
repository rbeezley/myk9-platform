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
import { ResultsDashboardRedirect } from './ResultsDashboardRedirect';
import { JudgeCheckInRedirect } from './JudgeCheckInRedirect';

// Judge page lazy imports
const JudgeDashboard = lazy(() => import('@/pages/JudgeDashboard'));

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
    {/* MYK9-850: retired mock-data screen, kept as a bookmark redirect */}
    <Route
      path="/judge/check-in"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.STEWARD, UserRole.SITE_ADMIN]}>
          <JudgeCheckInRedirect />
        </ProtectedRoute>
      }
    />

    {/* Results Management */}
    <Route
      path="/results/dashboard"
      element={
        <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
          <ResultsDashboardRedirect />
        </ProtectedRoute>
      }
    />
  </>
);
