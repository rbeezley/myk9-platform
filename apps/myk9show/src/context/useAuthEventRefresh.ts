import { useEffect, type MutableRefObject } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Run `onRefreshRef.current` when Supabase reports the session's token or user record
 * changed for the signed-in user (TOKEN_REFRESHED, USER_UPDATED). SIGNED_IN is
 * deliberately not a trigger: auth-js re-emits it whenever the tab regains
 * focus, which the focus/visibility refresh already covers, and a real sign-in
 * changes the user id, which reloads RBAC and identity from scratch.
 */
export function useAuthEventRefresh(
  userId: string | undefined,
  onRefreshRef: MutableRefObject<() => void>
): void {
  useEffect(() => {
    if (!userId) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(event => {
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') onRefreshRef.current();
    });
    return () => subscription.unsubscribe();
  }, [userId, onRefreshRef]);
}
