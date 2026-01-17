/**
 * Judge Routes - Lazy loaded routes for judge functionality
 * 
 * Includes scoring interfaces, judge dashboards, and check-in systems
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
const JudgeClassInterface = lazy(() => import('@/components/scoring/JudgeClassInterface').then(m => ({ default: m.JudgeClassInterface })));

// Scoring pages (new - using shared hooks from @myk9/scoring-ui)
const ScoringEntryListPage = lazy(() => import('@/pages/scoring/ScoringEntryListPage'));
const ScoresheetPage = lazy(() => import('@/pages/scoring/ScoresheetPage'));

// Results and analytics for judges
const ResultEntryDashboard = lazy(() => import('@/pages/ResultEntryDashboard'));

export const JudgeRoutes = () => (
  <>
    {/* Judge Dashboard Routes */}
    <Route path="/judge/dashboard" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><JudgeDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/judge/check-in" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.GATE_STEWARD, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><JudgeCheckInDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/judge-scoring" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><JudgeScoringPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Judge Scoring Class Routes */}
    <Route path="/shows/:showId/trials/:trialId/classes/:classId/judge" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><JudgeClassInterface /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/shows/:showId/trials/:trialId/classes/:classId/judge/:entryId" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><JudgeClassInterface /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* Results Management */}
    <Route path="/results/dashboard" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ResultEntryDashboard /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    {/* New Scoring Routes (using shared @myk9/scoring-ui hooks) */}
    <Route path="/scoring/classes/:classId/entries" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ScoringEntryListPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />

    <Route path="/scoring/classes/:classId/entries/:entryId" element={
      <ProtectedRoute requiredRole={[UserRole.JUDGE, UserRole.SECRETARY, UserRole.SITE_ADMIN]}>
        <SuspenseWrapper>
          <PageTransition><ScoresheetPage /></PageTransition>
        </SuspenseWrapper>
      </ProtectedRoute>
    } />
  </>
);