import { supabase } from '../supabaseClient';
import { resolveGetSessionUser } from '@/hooks/authSessionUser';

/**
 * A signed-in (non-anonymous) session, read from the local auth store — no
 * network. Replicas sync only for these sessions, so for a guest or a ringside
 * passcode session an empty replica is permanent, not "not synced yet".
 *
 * Uses the same resolved user as `useAuth` (MYK9-1992): a refresh that failed offline
 * leaves `getSession()` null while the saved session still names the account, and its
 * class reads must keep using the replica.
 */
export async function hasAuthenticatedSession(): Promise<boolean> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  const user = resolveGetSessionUser(session, error);
  return Boolean(user && !user.is_anonymous);
}
