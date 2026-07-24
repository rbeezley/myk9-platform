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
 * Premium on every surface. The legacy profile/early-adopter calculation is
 * kept only as the fallback for when the entitlement read is unavailable or
 * untrusted. AnalyticsPage's caller-provided `trialShowCount` axis is NOT
 * migrated here. New code should call `useEntitlement()` directly.
 */
export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading: isProfileLoading } = useExhibitorProfile();
  const { effective: newEffective, isTrusted, isLoading: isEntitlementLoading } = useEntitlement();

  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;

  const isExpired = rawTier === 'premium' && (!expiresAt || new Date(expiresAt) < new Date());

  const paidTier: PlanType = isExpired ? 'free' : rawTier;
  const isPaidPremium = paidTier === 'premium';

  // Founding member: premium for 12 months from grant (early_adopter_until),
  // not for life — an elapsed date is identical to never having the grant.
  const earlyAdopterUntil = profile?.person?.early_adopter_until;
  const isEarlyAdopter = !!earlyAdopterUntil && new Date(earlyAdopterUntil) > new Date();

  const isInTrial =
    !isPaidPremium &&
    !isExpired &&
    options?.trialShowCount !== undefined &&
    options.trialShowCount <= TRIAL_SHOW_LIMIT;

  const legacyAccountPremium = isPaidPremium || isEarlyAdopter;
  // The trusted resolver is authoritative for ACCOUNT Premium — it is the only
  // source that sees founding/complimentary grants. Fall back to the legacy
  // profile calculation only when no trusted result exists.
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
        legacySource: isPaidPremium ? 'paid' : isEarlyAdopter ? 'founding' : 'none',
        newAccountPremium,
        newSource: newEffective.source,
        newStatus: newEffective.status,
      });
    }
  }, [
    isProfileLoading,
    isEntitlementLoading,
    newEffective,
    legacyAccountPremium,
    isPaidPremium,
    isEarlyAdopter,
  ]);

  return {
    tier,
    isPremium: tier === 'premium',
    isExpired,
    isInTrial,
    isEarlyAdopter,
    // Neutral until BOTH reads settle — consumers must not flash a lock/unlock.
    isLoading: isProfileLoading || isEntitlementLoading,
  } as const;
}
