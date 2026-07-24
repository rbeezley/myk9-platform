// Account-scoped React Query hook over the sanitized entitlement context.
//
// One query key, deduplicated across every consumer (design.md Decision 6).
// Keeps the last trusted result visible for DISPLAY until `trustedUntil`,
// but authorization (`canAuthorizePremium`) fails closed the moment the
// result is no longer trusted — even if the page stays open and the stale
// value is still on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
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
  // The trustedUntil boundary that has already PASSED (set by the boundary
  // timeout / effect, never during render — render must stay pure, so we
  // cannot compare against Date.now() there). Guarantees a re-render at the
  // boundary so canAuthorizePremium flips to false even if refetch fails.
  const [expiredBoundary, setExpiredBoundary] = useState<string | null>(null);

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

    // Always go through a timeout (0ms when the boundary already passed) —
    // setState synchronously inside the effect body would cascade renders
    // (react-hooks/set-state-in-effect). The effect only re-runs when the
    // boundary string itself changes, and the ref guards invalidation to at
    // most once per boundary, so a failing refetch cannot storm.
    const delay = Math.max(0, Date.parse(trustedUntil) - Date.now());
    timeoutRef.current = setTimeout(() => {
      setExpiredBoundary(trustedUntil);
      if (lastInvalidatedBoundaryRef.current !== trustedUntil) {
        lastInvalidatedBoundaryRef.current = trustedUntil;
        queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY });
      }
    }, delay);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [trustedUntil, queryClient]);

  // Pure derivation: the boundary effect/timeout marks a passed trustedUntil,
  // so render never consults the wall clock directly.
  const isTrusted = !!effective && expiredBoundary !== effective.trustedUntil;

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
