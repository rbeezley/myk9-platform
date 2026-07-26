import { useEffect } from 'react';
import { useExhibitorProfile } from './useExhibitorProfile';
import { useEntitlement } from '@/features/entitlement/useEntitlement';
import { TRIAL_SHOW_LIMIT } from '@/features/entitlement/types';
import { logger } from '@/services/LoggingService';
import type { PlanType } from '@/components/subscription/featureUtils';

export { TRIAL_SHOW_LIMIT };

export interface SubscriptionGateOptions {
  /** Number of distinct shows where the user has at least one scored entry. */
  trialShowCount?: number;
}

/**
 * Hook to check current subscription tier with expiration and trial awareness.
 * Returns the effective tier (downgrades to 'free' if expired, upgrades to
 * 'premium' during shows-based trial) and convenience booleans.
 *
 * Usage:
 *   const { isPremium, isExpired, tier } = useSubscriptionGate();
 *   const { isPremium, isInTrial } = useSubscriptionGate({ trialShowCount: 2 });
 */
/**
 * NOTE: this hook is a thin compatibility wrapper preserved for its existing
 * callers (design.md Decision 6). Account-level Premium now comes from the
 * TRUSTED server-backed resolver whenever one is available, so an account
 * whose only Premium source is an active founding/complimentary grant is
 * Premium on every surface.
 *
 * As of task 8.2 the legacy `people.early_adopter_until` column is gone;
 * founding membership is read from its grant. The only remaining fallback is
 * the paid `subscription_tier` on the profile, used when the entitlement read
 * is unavailable or untrusted. AnalyticsPage's caller-provided
 * `trialShowCount` axis is NOT migrated here. New code should call
 * `useEntitlement()` directly.
 */
export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading: isProfileLoading } = useExhibitorProfile();
  const {
    effective: newEffective,
    isTrusted,
    canAuthorizePremium,
    isLoading: isEntitlementLoading,
  } = useEntitlement();

  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;

  const isExpired = rawTier === 'premium' && (!expiresAt || new Date(expiresAt) < new Date());

  const paidTier: PlanType = isExpired ? 'free' : rawTier;
  const isPaidPremium = paidTier === 'premium';

  // Founding membership now comes from the entitlement resolver's founding
  // GRANT, not the legacy `people.early_adopter_until` column (task 8.2).
  // Equivalent by construction: the 3A backfill created exactly one founding
  // grant per non-null legacy value, preserving its end date, and per-row
  // parity was verified before the column was removed.
  //
  // The resolver also handles expiry for us — an elapsed grant resolves to
  // status 'expired', which is identical to never having had one, so there is
  // no date comparison to get wrong here any more.
  // Read the founding GRANT, not the winning source. `source` is 'paid' when a
  // paid subscription outranks an active founding grant, so keying off it
  // would hide the founding-member banner from anyone holding both — the
  // legacy column was independent of the paid tier and this preserves that.
  const foundingGrant = isTrusted ? (newEffective?.foundingGrant ?? null) : null;
  const isEarlyAdopter = foundingGrant !== null;
  /** Founding grant end date, for display. Null unless a founding grant is active. */
  const foundingUntil = foundingGrant?.endsAt ?? null;

  const isInTrial =
    !isPaidPremium &&
    !isExpired &&
    options?.trialShowCount !== undefined &&
    options.trialShowCount <= TRIAL_SHOW_LIMIT;

  // Legacy fallback is now the PAID tier only. `isEarlyAdopter` no longer
  // belongs here: it is derived from the resolver above, so including it would
  // make this "fallback" depend on the very value it is meant to back up —
  // when untrusted it is false, and OR-ing a false changes nothing.
  //
  // Consequence worth stating: a founding member whose resolver read fails now
  // sees a locked UI instead of an unlocked one. That is a deliberate move to
  // fail-closed. It never affected writes — `canAuthorizePremium` already came
  // straight from the trusted resolver, so the old fallback could only ever
  // unlock DISPLAY for a write the server would then refuse.
  const legacyAccountPremium = isPaidPremium;
  // The trusted resolver is authoritative for ACCOUNT Premium — it is the only
  // source that sees founding/complimentary grants. Fall back to the legacy
  // paid-tier calculation only when no trusted result exists.
  const trustedAccountPremium = isTrusted && newEffective ? newEffective.tier === 'premium' : null;
  const accountPremium = trustedAccountPremium ?? legacyAccountPremium;

  const tier: PlanType = accountPremium || isInTrial ? 'premium' : 'free';

  // Structured legacy-fallback mismatch logging (design.md Decision 6). Only
  // compares account-level Premium (paid/founding/complimentary), since the
  // legacy trial here is caller-driven while the resolver's trial is
  // Analytics-scoped and server-computed — the two are not the same axis.
  useEffect(() => {
    if (isProfileLoading || isEntitlementLoading || !newEffective) return;

    const newAccountPremium = newEffective.tier === 'premium';

    if (legacyAccountPremium !== newAccountPremium) {
      logger.warn('useSubscriptionGate legacy/resolver mismatch', 'useSubscriptionGate', {
        legacyAccountPremium,
        legacySource: isPaidPremium ? 'paid' : 'none',
        newAccountPremium,
        newSource: newEffective.source,
        newStatus: newEffective.status,
      });
    }
  }, [isProfileLoading, isEntitlementLoading, newEffective, legacyAccountPremium, isPaidPremium]);

  return {
    tier,
    /** DISPLAY only. May be true off the untrusted legacy fallback. */
    isPremium: tier === 'premium',
    /**
     * The ONLY value that may unlock a Premium create/edit control. Comes
     * straight from the trusted resolver, so it fails closed exactly where the
     * server does — the legacy profile fallback (and the caller-driven trial)
     * can keep a lock open for DISPLAY without promising a write that the
     * server will reject.
     */
    canAuthorizePremium,
    isExpired,
    isInTrial,
    isEarlyAdopter,
    /** Founding grant end date for display; null unless founding is active. */
    foundingUntil,
    // Neutral until BOTH reads settle — consumers must not flash a lock/unlock.
    isLoading: isProfileLoading || isEntitlementLoading,
  } as const;
}
