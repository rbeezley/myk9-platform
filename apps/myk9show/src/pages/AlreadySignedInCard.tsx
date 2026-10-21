import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { SignOutWarningDialog } from '@/components/layout/SignOutWarningDialog';
import { getSignOutGuardMode, type SignOutWarningContext } from '@/components/layout/signOutGuard';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useGlobalSyncStatus } from '@/hooks/useGlobalSyncStatus';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getDashboardRoute } from '@/hooks/roleUtils';
import { getSignInReturnTo } from './SignInPage.helpers';

/**
 * Shown on /sign-in and /sign-up in place of the credential form when an account is already
 * signed in (MYK9-1280). Sign out goes through the same MYK9-202 offline-lockout guard as the
 * account menu.
 */
export function AlreadySignedInCard() {
  const { user, signOut, userWithRoles, getUserRoles } = useAuthContext();
  const globalSync = useGlobalSyncStatus();
  const networkStatus = useNetworkStatus();
  const [searchParams] = useSearchParams();
  // Only a validated target counts; '/' means none was given.
  const returnTo = getSignInReturnTo(searchParams);
  const hasReturnTo = returnTo !== '/';
  const [warning, setWarning] = useState<SignOutWarningContext | null>(null);

  const isOffline = !networkStatus.isOnline || globalSync.status === 'offline';
  const hasUnsyncedChanges =
    globalSync.status === 'pending' ||
    globalSync.status === 'error' ||
    globalSync.status === 'conflict' ||
    globalSync.queueSize > 0;
  const guardMode = getSignOutGuardMode({ isOffline, roles: getUserRoles() });

  const handleSignOut = () => {
    if (guardMode === 'none') {
      signOut();
      return;
    }
    setWarning({ mode: guardMode, hasUnsyncedChanges });
  };

  return (
    <div className="flex min-h-[calc(100vh-var(--pwa-banner-height,0px))] flex-col items-center justify-center bg-background px-3 pb-2 pt-[var(--app-header-height,3rem)]">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 text-center shadow-xl">
        <h1 className="text-2xl font-bold text-foreground">You are signed in</h1>
        {user?.email && (
          <p className="mt-2 text-sm text-muted-foreground">Signed in as {user.email}</p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild className="min-h-11 w-full">
            <Link to={hasReturnTo ? returnTo : getDashboardRoute(userWithRoles?.roles ?? [])}>
              {hasReturnTo ? 'Continue' : 'Go to your dashboard'}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link to="/at-show?passcode=1">Join a show with a passcode</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={handleSignOut}
          >
            Sign out
          </Button>
        </div>
      </div>
      <SignOutWarningDialog
        context={warning}
        onCancel={() => setWarning(null)}
        onConfirm={() => {
          setWarning(null);
          signOut();
        }}
      />
    </div>
  );
}
