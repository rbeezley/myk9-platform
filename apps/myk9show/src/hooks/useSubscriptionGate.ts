import { useExhibitorProfile } from './useExhibitorProfile';
import type { PlanType } from '@/components/subscription/featureUtils';

/**
 * Hook to check current subscription tier with expiration awareness.
 * Returns the effective tier (downgrades to 'free' if expired) and convenience booleans.
 *
 * Usage:
 *   const { isPremium, isExpired, tier } = useSubscriptionGate();
 *   if (!isPremium) return <PremiumGate />;
 */
export function useSubscriptionGate() {
  const { profile, isLoading } = useExhibitorProfile();

  const rawTier: PlanType = profile?.subscription_tier ?? 'free';
  const expiresAt = profile?.subscription_expires_at;

  const isExpired = rawTier === 'premium' && expiresAt ? new Date(expiresAt) < new Date() : false;

  const tier: PlanType = isExpired ? 'free' : rawTier;
  const isPremium = tier === 'premium';

  return { tier, isPremium, isExpired, isLoading } as const;
}
