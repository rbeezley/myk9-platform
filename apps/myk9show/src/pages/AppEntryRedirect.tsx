import { Navigate } from 'react-router-dom';
import { PageLoadingFallback } from '@/components/common/PageLoadingFallback';
import { isAccountSession } from '@/hooks/guestServerRead';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { useAuthContext } from '@/hooks/useAuthContext';
import { buildSignInPathForRedirect } from '@/pages/SignInPage.helpers';

/** The installed app's start_url (public/manifest.json). Redirect-only, no UI. */
export const APP_ENTRY_PATH = '/app';

/**
 * Where an installed app lands (MYK9-1674). Signed in goes to the same role
 * home `/` uses (`getDashboardRoute`); signed out goes to sign-in and returns
 * here, so the landing page never shows. Reads the same auth context the
 * protected routes use, so an offline cold start with a cached account
 * session counts as signed in. An anonymous ringside session is not one.
 */
export default function AppEntryRedirect() {
  const { user, loading, rbacLoading, userWithRoles } = useAuthContext();

  if (loading || rbacLoading) return <PageLoadingFallback />;
  if (!isAccountSession(user)) {
    return <Navigate to={buildSignInPathForRedirect(APP_ENTRY_PATH)} replace />;
  }
  return <Navigate to={getDashboardRoute(userWithRoles?.roles ?? [])} replace />;
}
