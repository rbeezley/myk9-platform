// Account-scoped React Query hook over the sanitized entitlement context.
//
// One query key, deduplicated across every consumer (design.md Decision 6).
// Keeps the last trusted result visible for DISPLAY until `trustedUntil`,
// but authorization (`canAuthorizePremium`) fails closed the moment the
// result is no longer trusted — even if the page stays open and the stale
// value is still on screen.

import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/hooks/useAuthContext';
import { fetchOwnEntitlementContext } from '@/services/database/entitlement/context';
import { resolveEntitlement } from './resolveEntitlement';
import type { EffectiveEntitlement } from './types';

export const ENTITLEMENT_QUERY_KEY = ['entitlement', 'own'] as const;

/** Short maximum-stale interval bounding trustedUntil when no source end is sooner. */
export const ENTITLEMENT_MAX_STALE_MS = 5 * 60 * 1000;

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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Boundary (trustedUntil ISO string) we've already invalidated for, so a
  // failing refetch — which leaves query.data (and therefore `effective`)
  // referentially unchanged but still re-renders — does not re-trigger
  // invalidateQueries on every render once the boundary has passed.
  const lastInvalidatedBoundaryRef = useRef<string | null>(null);

  const query = useQuery({
    queryKey: ENTITLEMENT_QUERY_KEY,
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

  // Schedule invalidation right at the trusted boundary so an expiring paid
  // subscription or grant is re-evaluated using server time while the app
  // stays open, without waiting for a user-driven focus/reconnect refetch.
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!trustedUntil) return undefined;

    const delay = Date.parse(trustedUntil) - Date.now();
    if (delay <= 0) {
      // Invalidate at most once per boundary — React Query's own retry/
      // backoff owns subsequent attempts if this one fails; isTrusted is
      // already false so authorization is fail-closed regardless.
      if (lastInvalidatedBoundaryRef.current !== trustedUntil) {
        lastInvalidatedBoundaryRef.current = trustedUntil;
        queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY });
      }
      return undefined;
    }

    timeoutRef.current = setTimeout(() => {
      lastInvalidatedBoundaryRef.current = trustedUntil;
      queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY });
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [trustedUntil, queryClient]);

  const isTrusted = !!effective && Date.parse(effective.trustedUntil) > Date.now();

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
