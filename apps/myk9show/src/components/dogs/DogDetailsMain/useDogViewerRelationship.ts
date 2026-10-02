import { useEffect, useState } from 'react';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useUserStore } from '@/store/userStore';
import { resolveViewerPersonId } from '@/utils/viewerPerson';
import type { Dog } from '@/types/dog-types';
import { resolveDogRelationship, type DogViewerRelationship } from './dogViewerAccess';

/** Longest the dog page waits for identity or roles before treating the viewer as a non-owner. */
const IDENTITY_WAIT_MS = 10_000;

/**
 * The viewer's relationship to `dog`, read from AuthContext's own loading
 * signals (`personIdentityState`, `rbacLoading`, and the cached `personId` that
 * keeps a cold offline boot useful).
 *
 * `pending` ends at the first resolution for this account and never returns:
 * RBAC refreshes every five minutes and sets `rbacLoading` while keeping its
 * roles, and unmounting the page on each refresh would lose the user's state.
 * It also ends when the viewer is offline or after IDENTITY_WAIT_MS, so a lookup
 * that can never finish does not leave a blank page.
 */
export function useDogViewerRelationship(
  dog: Pick<Dog, 'ownerId' | 'coOwnerId'>
): DogViewerRelationship {
  const { userWithRoles, personId, personIdentityState, rbacLoading } = useAuthContext();
  const people = useUserStore(state => state.people);
  const accountId = userWithRoles?.id ?? null;
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  const [timedOutFor, setTimedOutFor] = useState<string | null>(null);

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const gaveUp = offline || resolvedFor === accountId || timedOutFor === accountId;
  const relationship = resolveDogRelationship({
    dog,
    viewerPersonId: resolveViewerPersonId(userWithRoles, people) ?? personId,
    personIdentityState,
    rbacLoading,
    gaveUp,
  });

  const pending = relationship.kind === 'pending';
  // Latch the first resolution for this account (adjusting state during render is
  // the supported way to derive it, and avoids a pending flash between renders).
  if (!pending && resolvedFor !== accountId) setResolvedFor(accountId);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setTimedOutFor(accountId), IDENTITY_WAIT_MS);
    return () => clearTimeout(timer);
  }, [pending, accountId]);

  return relationship;
}
