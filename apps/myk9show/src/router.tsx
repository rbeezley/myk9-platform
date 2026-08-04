import React, { Suspense } from 'react';
import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { AdminRoutes } from './routes/adminRoutes';
import { JudgeSidebarRoutes } from './routes/judgeRoutes';
import { SecretaryRoutes } from './routes/secretaryRoutes';
import { ClubAdminRoutes } from './routes/clubAdminRoutes';
import { PublicRoutes } from './routes/publicRoutes';
import { AtShowRoutes } from './routes/atShowRoutes';
import { UnifiedAppLayout } from './components/layout/UnifiedAppLayout';
import { WizardSurfaceGate } from './components/WizardSurfaceGate';
import { PageLoadingFallback } from './components/common/PageLoadingFallback';
import { RoleSurfaceErrorBoundary } from './components/common/RoleSurfaceErrorBoundary';
import { PageTransition } from './components/common/PageTransition';

const ExhibitorOnboardingPage = React.lazy(
  () => import('./pages/onboarding/ExhibitorOnboardingPage')
);
const PricingPage = React.lazy(() => import('./pages/PricingPage'));
const SmartSignInPage = React.lazy(() => import('./pages/SmartSignInPage'));
const RingsideEntryPage = React.lazy(() => import('./features/at-show/RingsideEntryPage'));
const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const AuthCallbackPage = React.lazy(() => import('./pages/AuthCallbackPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

function HomeRedirect() {
  const { user, loading, rbacLoading, userWithRoles } = useAuthContext();

  if (loading || rbacLoading) return <PageLoadingFallback />;
  if (!user) return <Home />;

  const params = new URLSearchParams(window.location.search);
  if (params.get('wizard') === 'true') {
    return <Navigate to="/secretary/create-show/wizard" replace />;
  }
  if (params.get('onboarding') === 'true') {
    return <Home />;
  }

  return <Navigate to={getDashboardRoute(userWithRoles?.roles ?? [])} replace />;
}

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<App />}>
      <Route element={<WizardSurfaceGate />}>
        <Route
          path="/"
          element={
            <PageTransition>
              <HomeRedirect />
            </PageTransition>
          }
        />
        <Route
          path="/pricing-page"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <PricingPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route
          path="/sign-in"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <SmartSignInPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route
          path="/at-show"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <RingsideEntryPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route path="/login" element={<Navigate to="/sign-in" replace />} />
        <Route
          path="/sign-up"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <SignUpPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route
          path="/forgot-password"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <ForgotPasswordPage />
              </Suspense>
            </PageTransition>
          }
        />
        <Route
          path="/auth/callback"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <AuthCallbackPage />
            </Suspense>
          }
        />
        <Route
          path="/reset-password"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <ResetPasswordPage />
            </Suspense>
          }
        />
        <Route
          path="/onboarding"
          element={
            <Suspense fallback={<PageLoadingFallback />}>
              <ExhibitorOnboardingPage />
            </Suspense>
          }
        />

        {AtShowRoutes()}

        <Route element={<UnifiedAppLayout />}>
          <Route element={<RoleSurfaceErrorBoundary surface="admin" />}>{AdminRoutes()}</Route>
          <Route element={<RoleSurfaceErrorBoundary surface="judge" />}>
            {JudgeSidebarRoutes()}
          </Route>
          <Route element={<RoleSurfaceErrorBoundary surface="secretary" />}>
            {SecretaryRoutes()}
          </Route>
          <Route element={<RoleSurfaceErrorBoundary surface="admin" />}>{ClubAdminRoutes()}</Route>
          <Route element={<RoleSurfaceErrorBoundary surface="exhibitor" />}>{PublicRoutes()}</Route>
        </Route>

        <Route
          path="*"
          element={
            <PageTransition>
              <Suspense fallback={<PageLoadingFallback />}>
                <NotFoundPage />
              </Suspense>
            </PageTransition>
          }
        />
      </Route>
    </Route>
  )
);
