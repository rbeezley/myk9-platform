import { useExhibitorProfile } from './useExhibitorProfile';
import type { PlanType } from '@/components/subscription/featureUtils';

export const TRIAL_SHOW_LIMIT = 3;

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
export function useSubscriptionGate(options?: SubscriptionGateOptions) {
  const { profile, isLoading } = useExhibitorProfile();

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

  const tier: PlanType = isPaidPremium || isEarlyAdopter || isInTrial ? 'premium' : 'free';

  return {
    tier,
    isPremium: tier === 'premium',
    isExpired,
    isInTrial,
    isEarlyAdopter,
    isLoading,
  } as const;
}
