/**
 * useLocalPresenceIdentity — resolves "who am I, for presence purposes" once.
 *
 * Two ways a person is at a show:
 *  1. A signed-in account (AuthContext.user) — real identity wins.
 *  2. An ANONYMOUS passcode grant (ringsideGrantStore) — a judge/steward who
 *     typed the show passcode but has no account. They still belong on the
 *     per-ring judge dot and the "who's here" stack, so they get a presence
 *     identity derived from the grant: the optional name they typed (else a
 *     role label), the grant's role, and the grant's stable session id.
 *
 * The show-scoped grant ROLE wins over the account's default role for display,
 * because presence is "what are you doing at THIS show" — a steward who entered
 * a judge passcode and is scoring should light the *judge* dot (see
 * `judgesOnClass`, which filters role === 'judge').
 *
 * Resolving identity here (not inside the engine) means the producer
 * (useShowPresence) and the viewer (ShowPresenceProvider's privacy filter) read
 * ONE source and can never disagree. Returns null when presence is off (kill
 * switch) or when there is neither an account nor a show-scoped grant.
 */

import { useMemo } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { getPrimaryRole } from '@/context/AuthContext';
import { useRingsideGrantStore, selectGrantRoleForShow } from '@/store/ringsideGrantStore';
import { useCurrentUserPerson } from '@/hooks/useProfileForm';
import { features } from '@/config/features';

export interface LocalPresenceIdentity {
  userId: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

/** Kill switch (plan §12), mirrored from the engine so a dark hook is a no-op. */
function showPresenceEnabled(): boolean {
  return features.showPresence || import.meta.env?.VITE_SHOW_PRESENCE === 'true';
}

/** Human label for a nameless anonymous grant, e.g. 'judge' → 'Judge'. */
export function roleLabel(role: string): string {
  if (!role) return 'Someone';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function useLocalPresenceIdentity(
  showId: string | undefined
): LocalPresenceIdentity | null {
  const { user, firstName, lastName, getUserRoles } = useAuthContext();
  const activeGrant = useRingsideGrantStore(state => state.activeGrant);

  // Evaluate the kill switch first so a dark hook never even reads the
  // presence-only auth field (getUserRoles) — older auth mocks omit it (P1).
  const enabled = showPresenceEnabled();
  const userId = user?.id;
  const email = user?.email;
  // Use the HIGHEST-privilege role (getPrimaryRole walks the role hierarchy), not
  // getUserRoles()[0] — the first role is often 'exhibitor' even for a secretary,
  // which mis-classified per-show staff as exhibitors and (via the privacy filter)
  // hid them from everyone. Matches how AtShowAccessGate treats account roles.
  const accountRole = enabled && userId ? getPrimaryRole(getUserRoles?.() ?? []) : null;
  // Grant role only when scoped to THIS show; wins over the account role.
  const grantRole = enabled ? selectGrantRoleForShow(activeGrant, showId) : null;
  const grantName = activeGrant?.name;
  const grantSessionId = activeGrant?.sessionId;

  // profileImage lives on the people table, not the auth profile. AppHeader calls
  // the same hook so this is always a React Query cache hit — no extra network request.
  const { data: personRecord } = useCurrentUserPerson(userId);
  const avatarUrl = personRecord?.profileImage ?? undefined;

  return useMemo<LocalPresenceIdentity | null>(() => {
    if (!enabled) return null;
    if (userId) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ');
      return {
        userId,
        name: fullName || email?.split('@')[0] || 'Someone',
        role: grantRole ?? accountRole ?? 'exhibitor',
        ...(avatarUrl !== undefined && { avatarUrl }),
      };
    }
    // Anonymous: only a present, show-scoped grant with a session id is a producer.
    if (grantRole && grantSessionId) {
      return {
        userId: grantSessionId,
        name: grantName?.trim() || roleLabel(grantRole),
        role: grantRole,
      };
    }
    return null;
  }, [enabled, userId, email, firstName, lastName, accountRole, grantRole, grantName, grantSessionId, avatarUrl]);
}
