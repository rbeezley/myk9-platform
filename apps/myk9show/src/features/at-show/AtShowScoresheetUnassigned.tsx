/**
 * "You're not assigned to judge this class" on the at-show scoresheet (MYK9-82), with its
 * escape to a guest passcode. Split out of AtShowScoresheetPage (MYK9-2013) when that
 * escape joined the sign-out guard.
 */
import { useCallback, useState } from 'react';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { RingsideUpButton } from '@myk9/ui';
import { Button } from '@/components/ui/button';
import { SignOutWarningDialog } from '@/components/layout/SignOutWarningDialog';
import type { SignOutWarningContext } from '@/components/layout/signOutGuard';
import { resolveSignOutWarning } from '@/components/layout/signOutWarning';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useOnlineStatus } from '@/lib/networkUtils';
import { replicatedClassesTable } from '@/services/replication';
import { supabase } from '@/services/database/supabaseClient';
import { useRingsideGrantStore } from '@/store/ringsideGrantStore';
import { useNavigate } from 'react-router-dom';

export function AtShowScoresheetUnassigned({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const { getUserRoles } = useAuthContext();
  const isOnline = useOnlineStatus();
  const [signOutError, setSignOutError] = useState(false);
  const [warning, setWarning] = useState<SignOutWarningContext | null>(null);

  // The only passcode path that actually authorizes scoring is an ANONYMOUS
  // guest session (validate-passcode stamps the show-scoped claim only on anon
  // sessions). A signed-in judge must therefore sign out first, then enter the
  // passcode as a guest. We sign out via supabase DIRECTLY rather than the
  // AuthContext `signOut` (which hard-redirects to '/', clobbering the
  // navigation below), scoped `local` so we don't revoke the user's other
  // devices. Crucially, auth-js removes the on-device session even when the
  // revoke request errors, so the returned { error } does NOT tell us whether
  // we're still signed in — decide by the ACTUAL resulting session instead. If
  // it's gone (the normal case, error or not) we clear the in-memory ringside
  // grant (the hard reload we skipped is what ringsideGrantStore otherwise
  // relied on) and open the passcode form; only a still-live session stays put.
  const signOutToPasscode = useCallback(async () => {
    setSignOutError(false);
    await supabase.auth.signOut({ scope: 'local' });
    // Proceed ONLY when we can positively confirm no session remains. A retained
    // session, OR an inconclusive read — auth-js returns { session: null, error }
    // when an expired token's refresh fails transiently (e.g. offline) while
    // keeping the persisted session for a later retry — keeps us here with a
    // retry message. Navigating then would strand the judge: once connectivity
    // returns, anonymous passcode sign-in refuses to replace the live account.
    const { data, error } = await supabase.auth.getSession();
    if (data.session || error) {
      setSignOutError(true);
      return;
    }
    await replicatedClassesTable.clearCachedHideCounts();
    useRingsideGrantStore.getState().clearGrant();
    navigate('/at-show?passcode=1');
  }, [navigate]);

  // MYK9-2013: this is a sign-out like any other, so unsent scores (and the venue lockout)
  // warn first; the local-scope sign-out above runs only once the judge confirms.
  const handleSignOutToPasscode = () => {
    setSignOutError(false);
    void resolveSignOutWarning({ isOffline: !isOnline, roles: getUserRoles() }).then(next => {
      if (next) setWarning(next);
      else void signOutToPasscode();
    });
  };

  return (
    <main className="ringside-root container max-w-2xl mx-auto px-4 py-6">
      <div className="rounded-xl border bg-card p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">You&apos;re not assigned to judge this class</p>
        <p className="text-muted-foreground">
          Scores from an unassigned account can&apos;t be saved. Ask the secretary to add you as the
          judge for this class. To score with a show passcode instead, sign out and enter it as a
          guest.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <RingsideUpButton label="Entries" onClick={onBack} />
          <Button variant="ghost" className="min-h-11" onClick={handleSignOutToPasscode}>
            <KeyRound className="h-4 w-4 mr-2" />
            Sign out to use a passcode
          </Button>
        </div>
        {signOutError && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Couldn&apos;t sign out. Check your connection and try again.
          </p>
        )}
      </div>
      <SignOutWarningDialog
        context={warning}
        onCancel={() => setWarning(null)}
        onConfirm={() => {
          setWarning(null);
          void signOutToPasscode();
        }}
      />
    </main>
  );
}
