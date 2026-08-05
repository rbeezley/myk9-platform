import React from 'react';
import { Navigate } from 'react-router-dom';
import Home from './pages/Home';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PageLoadingFallback } from './components/common/PageLoadingFallback';

export const ExhibitorOnboardingPage = React.lazy(
  () => import('./pages/onboarding/ExhibitorOnboardingPage')
);
export const PricingPage = React.lazy(() => import('./pages/PricingPage'));
export const SmartSignInPage = React.lazy(() => import('./pages/SmartSignInPage'));
export const RingsideEntryPage = React.lazy(() => import('./features/at-show/RingsideEntryPage'));
export const SignUpPage = React.lazy(() => import('./pages/SignUpPage'));
export const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
export const AuthCallbackPage = React.lazy(() => import('./pages/AuthCallbackPage'));
export const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
export const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'));

export function HomeRedirect() {
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
