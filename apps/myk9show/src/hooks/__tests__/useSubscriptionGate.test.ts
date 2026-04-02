import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseExhibitorProfile =
  vi.fn<() => { profile: Record<string, unknown> | null; isLoading: boolean }>();

vi.mock('@/hooks/useExhibitorProfile', () => ({
  useExhibitorProfile: () => mockUseExhibitorProfile(),
}));

import { useSubscriptionGate } from '../useSubscriptionGate';

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

function mockFreeProfile() {
  mockUseExhibitorProfile.mockReturnValue({
    profile: { subscription_tier: 'free', subscription_expires_at: null },
    isLoading: false,
  });
}

function mockPremiumProfile(expiresAt: string) {
  mockUseExhibitorProfile.mockReturnValue({
    profile: { subscription_tier: 'premium', subscription_expires_at: expiresAt },
    isLoading: false,
  });
}

describe('useSubscriptionGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
