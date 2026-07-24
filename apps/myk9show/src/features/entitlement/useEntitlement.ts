// Account-scoped React Query hook over the sanitized entitlement context.
//
// One query key per authenticated account, deduplicated across every consumer
// (design.md Decision 6). Keeps the last trusted result visible for DISPLAY
// until `trustedUntil`, but authorization (`canAuthorizePremium`) fails closed
// the moment the result is no longer trusted — even if the page stays open and
// the stale value is still on screen.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { fetchOwnEntitlementContext } from '@/services/database/entitlement/context';
import { resolveEntitlement } from './resolveEntitlement';
import type { EffectiveEntitlement } from './types';

/** Shared prefix for every account's entitlement query. */
export const ENTITLEMENT_QUERY_KEY = ['entitlement', 'own'] as const;

/**
 * Account-scoped query key. The user id MUST be part of the key: a cross-tab
 * auth change to a different account otherwise serves the previous account's
 * cached entitlement.
 */
export function entitlementQueryKey(userId: string | undefined | null) {
  return [...ENTITLEMENT_QUERY_KEY, userId ?? 'anonymous'] as const;
}

/** Short maximum-stale interval bounding trustedUntil when no source end is sooner. */
export const ENTITLEMENT_MAX_STALE_MS = 5 * 60 * 1000;

/**
 * Module-level so the component body never lexically reads the clock (the repo
 * lints `react-hooks/purity` as an error). Used as a useSyncExternalStore
 * snapshot, which is the supported way to read an external, time-based value
 * synchronously on the FIRST render — required for fail-closed behaviour when
 * React Query hands us cached data whose boundary already passed.
 */
function boundaryPassedSnapshot(localDeadlineMs: number | null): boolean {
  return localDeadlineMs != null && Date.now() >= localDeadlineMs;
}

/** No-op subscribe: re-renders at the boundary come from the scheduled timeout. */
function subscribeToNothing(): () => void {
  return () => {};
}

export interface UseEntitlementResult {
  /** Best-known entitlement for display; may be a stale-but-not-yet-expired trusted value. */
  effective: EffectiveEntitlement | null;
  /** True while `effective` is within its trustedUntil boundary. */
  isTrusted: boolean;
  /** The ONLY value that may authorize a Premium create/update. False when untrusted or absent. */
  canAuthorizePremium: boolean;
  /** Neutral loading state: true only before any result (trusted or not) has ever loaded. */
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useEntitlement(): UseEntitlementResult {
  const { user } = useAuthContext();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => entitlementQueryKey(user?.id), [user?.id]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Boundary (trustedUntil ISO string) we've already invalidated for, so a
  // failing refetch — which leaves query.data (and therefore `effective`)
  // referentially unchanged but still re-renders — does not re-trigger
  // invalidateQueries on every render once the boundary has passed.
  const lastInvalidatedBoundaryRef = useRef<string | null>(null);
  // The trustedUntil boundary that has already PASSED (set by the boundary
  // timeout, never during render). Guarantees a re-render at the boundary so
  // canAuthorizePremium flips to false even if the refetch fails.
  const [expiredBoundary, setExpiredBoundary] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: fetchOwnEntitlementContext,
    enabled: !!user?.id,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // query.data is referentially stable across failed refetches, so this only
  // recomputes when a new context actually lands.
  const effective = useMemo(
    () =>
      query.data ? resolveEntitlement(query.data, { maxStaleMs: ENTITLEMENT_MAX_STALE_MS }) : null,
    [query.data]
  );
  const trustedUntil = effective?.trustedUntil ?? null;

  // Trust is a SERVER-relative interval (trustedUntil - evaluatedAt), anchored
  // to the local instant the result was received (React Query's dataUpdatedAt).
  // Never mix the server timestamp with the device clock directly: a skewed
  // client would otherwise extend or truncate trust arbitrarily.
  const serverTrustIntervalMs = effective
    ? Math.max(0, Date.parse(effective.trustedUntil) - Date.parse(effective.evaluatedAt))
    : null;
  const localDeadlineMs =
    serverTrustIntervalMs != null && query.dataUpdatedAt > 0
      ? query.dataUpdatedAt + serverTrustIntervalMs
      : null;

  // Synchronous, first-render-correct answer to "has the boundary passed?".
  const boundaryPassedNow = useSyncExternalStore(
    subscribeToNothing,
    () => boundaryPassedSnapshot(localDeadlineMs),
    () => false
  );

  // Schedule invalidation right at the trusted boundary so an expiring paid
  // subscription or grant is re-evaluated using server time while the app
  // stays open, without waiting for a user-driven focus/reconnect refetch.
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!trustedUntil || localDeadlineMs == null || serverTrustIntervalMs == null) return undefined;

    // Always go through a timeout (0ms when the boundary already passed) —
    // setState synchronously inside the effect body would cascade renders
    // (react-hooks/set-state-in-effect). The delay is clamped to the server's
    // own interval so a device clock behind the server cannot extend trust.
    const delay = Math.min(serverTrustIntervalMs, Math.max(0, localDeadlineMs - Date.now()));
    timeoutRef.current = setTimeout(() => {
      setExpiredBoundary(trustedUntil);
      if (lastInvalidatedBoundaryRef.current !== trustedUntil) {
        lastInvalidatedBoundaryRef.current = trustedUntil;
        queryClient.invalidateQueries({ queryKey });
      }
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [trustedUntil, localDeadlineMs, serverTrustIntervalMs, queryClient, queryKey]);

  const boundaryPassed = boundaryPassedNow || expiredBoundary === trustedUntil;
  const isTrusted = !!effective && !boundaryPassed;

  return {
    effective,
    isTrusted,
    canAuthorizePremium: isTrusted && effective?.tier === 'premium',
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => {
      void query.refetch();
    },
  };
}
