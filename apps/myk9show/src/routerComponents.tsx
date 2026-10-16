import { lazyWithRetry } from '@/utils/lazyWithRetry';
import { Navigate } from 'react-router-dom';
import Home from './pages/Home';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PageLoadingFallback } from './components/common/PageLoadingFallback';

export const ExhibitorOnboardingPage = lazyWithRetry(
  () => import('./pages/onboarding/ExhibitorOnboardingPage')
);
export const PricingPage = lazyWithRetry(() => import('./pages/PricingPage'));
export const SmartSignInPage = lazyWithRetry(() => import('./pages/SmartSignInPage'));
export const RingsideEntryPage = lazyWithRetry(
  () => import('./features/at-show/RingsideEntryPage')
);
export const SignUpPage = lazyWithRetry(() => import('./pages/SignUpPage'));
export const ForgotPasswordPage = lazyWithRetry(() => import('./pages/ForgotPasswordPage'));
export const AuthCallbackPage = lazyWithRetry(() => import('./pages/AuthCallbackPage'));
export const ResetPasswordPage = lazyWithRetry(() => import('./pages/ResetPasswordPage'));
export const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'));

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
