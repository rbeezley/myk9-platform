import { useAuthContext } from '@/hooks/useAuthContext';
import { isPublicGuest } from '@/hooks/guestServerRead';

export interface DirectoryViewer {
  /** Signed out, or an anonymous (ringside passcode) session. */
  isGuest: boolean;
  /** A real signed-in account: the replica-backed club path applies. */
  isSignedIn: boolean;
  /** Auth has not resolved yet, so neither club source is safe to show. */
  authLoading: boolean;
  /** Keys the guest server reads per principal, so sign-out changes the key. */
  principalKey: string;
}

/**
 * MYK9-747: who is looking at the public club directory or a club page. The
 * shared public-guest rule (isPublicGuest): an anonymous (ringside passcode)
 * session is a guest too. See the INTENT in useBrowseClubsData.
 */
export function useDirectoryViewer(): DirectoryViewer {
  const { user, loading: authLoading } = useAuthContext();
  const isGuest = isPublicGuest(user, authLoading);
  return {
    isGuest,
    isSignedIn: !authLoading && !isGuest,
    authLoading,
    principalKey: user?.id ?? 'signed-out',
  };
}
