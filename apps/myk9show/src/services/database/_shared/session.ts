import { supabase } from '../supabaseClient';

/**
 * A signed-in (non-anonymous) session, read from the local auth store — no
 * network. Replicas sync only for these sessions, so for a guest or a ringside
 * passcode session an empty replica is permanent, not "not synced yet".
 */
export async function hasAuthenticatedSession(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return Boolean(session?.user && !session.user.is_anonymous);
}
