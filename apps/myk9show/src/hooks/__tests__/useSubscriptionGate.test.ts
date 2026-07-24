import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseExhibitorProfile =
  vi.fn<() => { profile: Record<string, unknown> | null; isLoading: boolean }>();

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => mockUseExhibitorProfile(),
}));

// Mutable entitlement stub. Default = settled but with NO trusted result, so
// the wrapper falls back to the legacy profile calculation (the pre-existing
// contract exercised by most cases below).
const entitlementHolder: {
  effective: Record<string, unknown> | null;
  isTrusted: boolean;
  isLoading: boolean;
  isError: boolean;
} = { effective: null, isTrusted: false, isLoading: false, isError: false };

vi.mock('@/features/entitlement/useEntitlement', () => ({
  useEntitlement: () => ({
    effective: entitlementHolder.effective,
    isTrusted: entitlementHolder.isTrusted,
    canAuthorizePremium:
      entitlementHolder.isTrusted && entitlementHolder.effective?.tier === 'premium',
    isLoading: entitlementHolder.isLoading,
    isError: entitlementHolder.isError,
    refetch: vi.fn(),
  }),
}));

function trustedEntitlement(
  tier: 'free' | 'premium',
  source: 'paid' | 'founding' | 'complimentary' | 'none'
) {
  entitlementHolder.effective = {
    tier,
    status: tier === 'premium' ? 'active' : 'free',
    source,
    evaluatedAt: new Date().toISOString(),
    trustedUntil: new Date(Date.now() + 60_000).toISOString(),
    analyticsTrial: { status: 'unavailable', scoredShowCount: null, showLimit: 3 },
  };
  entitlementHolder.isTrusted = true;
  entitlementHolder.isLoading = false;
}

import { useSubscriptionGate } from '../useSubscriptionGate';

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function mockFreeProfile() {
  mockUseExhibitorProfile.mockReturnValue({
    profile: { subscription_tier: 'free', subscription_expires_at: null, person: null },
    isLoading: false,
  });
}

function mockPremiumProfile(expiresAt: string) {
  mockUseExhibitorProfile.mockReturnValue({
    profile: { subscription_tier: 'premium', subscription_expires_at: expiresAt, person: null },
    isLoading: false,
  });
}

function mockEarlyAdopterProfile(until: string = futureDate) {
  mockUseExhibitorProfile.mockReturnValue({
    profile: {
      subscription_tier: 'free',
      subscription_expires_at: null,
      person: { early_adopter_until: until },
    },
    isLoading: false,
  });
}

describe('useSubscriptionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlementHolder.effective = null;
    entitlementHolder.isTrusted = false;
    entitlementHolder.isLoading = false;
    entitlementHolder.isError = false;
  });

  describe('existing behavior (no options)', () => {
    it('returns free tier when profile has no subscription', () => {
      mockFreeProfile();

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isInTrial).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns premium tier for active premium subscriber', () => {
      mockPremiumProfile(futureDate);

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isExpired).toBe(false);
      expect(result.current.isInTrial).toBe(false);
    });

    it('downgrades expired premium to free', () => {
      mockPremiumProfile(pastDate);

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isExpired).toBe(true);
      expect(result.current.isInTrial).toBe(false);
    });

    it('treats premium with null expiry as expired', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: { subscription_tier: 'premium', subscription_expires_at: null },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isExpired).toBe(true);
    });

    it('returns free tier when profile is null', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: null,
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
    });
  });

  describe('trial logic (with trialShowCount)', () => {
    it('grants premium via trial when user has 0 scored shows', () => {
      mockFreeProfile();

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 0 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(true);
    });

    it('grants premium via trial when user has exactly 3 scored shows', () => {
      mockFreeProfile();

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 3 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(true);
    });

    it('does NOT grant trial when user has 4+ scored shows', () => {
      mockFreeProfile();

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 4 }));

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isInTrial).toBe(false);
    });

    it('does NOT activate trial for paid premium subscribers', () => {
      mockPremiumProfile(futureDate);

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 1 }));

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isInTrial).toBe(false);
    });

    it('does not activate trial for expired premium user', () => {
      mockPremiumProfile(pastDate);

      const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 1 }));

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
      expect(result.current.isInTrial).toBe(false);
      expect(result.current.isExpired).toBe(true);
    });
  });

  describe('early adopter access', () => {
    it('grants premium to early adopter with free subscription tier', () => {
      mockEarlyAdopterProfile();

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isEarlyAdopter).toBe(true);
      expect(result.current.isInTrial).toBe(false);
      expect(result.current.isExpired).toBe(false);
    });

    it('isEarlyAdopter is false when person is null', () => {
      mockFreeProfile();

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isEarlyAdopter).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });

    it('isEarlyAdopter is false when early_adopter_until is null (never granted)', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: {
          subscription_tier: 'free',
          subscription_expires_at: null,
          person: { early_adopter_until: null },
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isEarlyAdopter).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });

    it('founding membership EXPIRES: a past early_adopter_until no longer grants premium', () => {
      mockEarlyAdopterProfile(pastDate);

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isEarlyAdopter).toBe(false);
      expect(result.current.isPremium).toBe(false);
    });

    it('early adopter with expired paid subscription still gets premium via founding grant', () => {
      mockUseExhibitorProfile.mockReturnValue({
        profile: {
          subscription_tier: 'premium',
          subscription_expires_at: pastDate,
          person: { early_adopter_until: futureDate },
        },
        isLoading: false,
      });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isExpired).toBe(true);
      expect(result.current.isEarlyAdopter).toBe(true);
      expect(result.current.isPremium).toBe(true);
    });
  });

  describe('server-backed entitlement (trusted resolver is authoritative)', () => {
    it('grant-only account is premium: no legacy profile Premium signal at all', () => {
      // subscription_tier 'free', no early_adopter_until — the ONLY Premium
      // source is an active complimentary grant, visible only to the resolver.
      mockFreeProfile();
      trustedEntitlement('premium', 'complimentary');

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('premium');
      expect(result.current.isPremium).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('founding grant seen only by the resolver also unlocks premium', () => {
      mockFreeProfile();
      trustedEntitlement('premium', 'founding');

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isPremium).toBe(true);
    });

    it('a trusted free result locks an account the legacy fields would have called premium', () => {
      mockEarlyAdopterProfile();
      trustedEntitlement('free', 'none');

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.tier).toBe('free');
      expect(result.current.isPremium).toBe(false);
    });

    it('untrusted entitlement falls back to the legacy calculation', () => {
      mockPremiumProfile(futureDate);
      // A result exists but its trust boundary passed (failed refresh).
      trustedEntitlement('free', 'none');
      entitlementHolder.isTrusted = false;

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isPremium).toBe(true);
    });

    it('failed entitlement read falls back to the legacy calculation', () => {
      mockEarlyAdopterProfile();
      entitlementHolder.effective = null;
      entitlementHolder.isError = true;

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isPremium).toBe(true);
      expect(result.current.isEarlyAdopter).toBe(true);
    });

    it('loading is neutral until BOTH the profile and entitlement reads settle', () => {
      mockFreeProfile();
      entitlementHolder.isLoading = true;

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isLoading).toBe(true);
    });

    it('loading is neutral while the profile is still loading', () => {
      mockUseExhibitorProfile.mockReturnValue({ profile: null, isLoading: true });

      const { result } = renderHook(() => useSubscriptionGate());

      expect(result.current.isLoading).toBe(true);
    });
  });
});
