import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';

/**
 * Derives judge identity from the application's AuthContext.
 *
 * When the current user is logged in, their database user ID and
 * display name are used as the judge identity. If no user is signed
 * in, `isAuthenticated` is `false` and the caller should show the
 * authentication view.
 */
export function useJudgeAuth() {
  const { user, userWithRoles } = useAuthContext();

  return useMemo(() => {
    if (!user) {
      return { judgeId: '', judgeName: '', isAuthenticated: false };
    }

    const displayName =
      [user.user_metadata?.firstName, user.user_metadata?.lastName]
        .filter(Boolean)
        .join(' ') ||
      user.email ||
      'Unknown Judge';

    return {
      judgeId: userWithRoles?.databaseUserId ?? user.id,
      judgeName: displayName,
      isAuthenticated: true,
    };
  }, [user, userWithRoles]);
}
