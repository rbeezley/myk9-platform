/**
 * Tests for useSubscriptionGate's DISPLAY vs AUTHORIZATION split: the legacy
 * profile fallback may keep `isPremium` true when the entitlement read is
 * untrusted, but `canAuthorizePremium` must fail closed exactly where the
 * server does, so no create/edit control is offered for a rejected write.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

const { useExhibitorProfile, useEntitlement } = vi.hoisted(() => ({
  useExhibitorProfile: vi.fn(),
  useEntitlement: vi.fn(),
}));

vi.mock('./useExhibitorProfile', () => ({ useExhibitorProfile }));
vi.mock('@/features/entitlement/useEntitlement', () => ({ useEntitlement }));
vi.mock('@/services/LoggingService', () => ({ logger: { warn: vi.fn() } }));

import { useSubscriptionGate } from './useSubscriptionGate';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

describe('useSubscriptionGate', () => {
  beforeEach(() => {
    useExhibitorProfile.mockReset();
    useEntitlement.mockReset();
  });

  it('keeps display Premium from the legacy fallback but refuses to authorize it', () => {
    // Paid tier on the profile, entitlement read present but no longer trusted.
    useExhibitorProfile.mockReturnValue({
      profile: { subscription_tier: 'premium', subscription_expires_at: FUTURE },
      isLoading: false,
    });
    useEntitlement.mockReturnValue({
      effective: { tier: 'free', source: 'none', status: 'none' },
      isTrusted: false,
      canAuthorizePremium: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useSubscriptionGate());

    expect(result.current.isPremium).toBe(true);
    expect(result.current.canAuthorizePremium).toBe(false);
  });

  it('authorizes Premium when the trusted resolver says premium', () => {
    useExhibitorProfile.mockReturnValue({ profile: { subscription_tier: 'free' }, isLoading: false });
    useEntitlement.mockReturnValue({
      effective: { tier: 'premium', source: 'grant', status: 'active' },
      isTrusted: true,
      canAuthorizePremium: true,
      isLoading: false,
    });

    const { result } = renderHook(() => useSubscriptionGate());

    expect(result.current.isPremium).toBe(true);
    expect(result.current.canAuthorizePremium).toBe(true);
  });

  it('never authorizes Premium off the caller-driven trial axis alone', () => {
    useExhibitorProfile.mockReturnValue({ profile: { subscription_tier: 'free' }, isLoading: false });
    useEntitlement.mockReturnValue({
      effective: null,
      isTrusted: false,
      canAuthorizePremium: false,
      isLoading: false,
    });

    const { result } = renderHook(() => useSubscriptionGate({ trialShowCount: 1 }));

    expect(result.current.isInTrial).toBe(true);
    expect(result.current.isPremium).toBe(true);
    expect(result.current.canAuthorizePremium).toBe(false);
  });
});
