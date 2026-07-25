import { describe, expect, it } from 'vitest';
import { resolveEntitlement } from './resolveEntitlement';
import type { OwnEntitlementContext } from '@/services/database/entitlement/types';

const EVALUATED_AT = '2026-07-24T12:00:00.000Z';
const MAX_STALE_MS = 5 * 60 * 1000;

function baseContext(overrides: Partial<OwnEntitlementContext> = {}): OwnEntitlementContext {
  return {
    evaluated_at: EVALUATED_AT,
    paid_tier: null,
    paid_expires_at: null,
    grant_type: null,
    grant_status: null,
    grant_starts_at: null,
    grant_ends_at: null,
    scored_show_count: 0,
    ...overrides,
  };
}

describe('resolveEntitlement', () => {
  it('active paid subscription: premium, source paid, billing manageable', () => {
    const result = resolveEntitlement(
      baseContext({
        paid_tier: 'premium',
        paid_expires_at: '2026-08-24T12:00:00.000Z',
        scored_show_count: 5,
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({
      tier: 'premium',
      status: 'active',
      source: 'paid',
      canManageBilling: true,
    });
    expect(result.analyticsTrial.status).toBe('unavailable');
  });

  it('active founding grant: premium, source founding, billing NOT manageable', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'founding',
        grant_status: 'active',
        grant_ends_at: '2027-01-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({
      tier: 'premium',
      status: 'active',
      source: 'founding',
      canManageBilling: false,
    });
  });

  it('active complimentary grant: premium, source complimentary, billing NOT manageable', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'complimentary',
        grant_status: 'active',
        grant_ends_at: '2026-12-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({
      tier: 'premium',
      status: 'active',
      source: 'complimentary',
      canManageBilling: false,
    });
  });

  it('Analytics-scoped trial: free tier, trial active, within TRIAL_SHOW_LIMIT', () => {
    const result = resolveEntitlement(baseContext({ scored_show_count: 3 }), {
      maxStaleMs: MAX_STALE_MS,
    });

    expect(result.tier).toBe('free');
    expect(result.status).toBe('free');
    expect(result.analyticsTrial).toEqual({
      status: 'active',
      scoredShowCount: 3,
      showLimit: 3,
    });
  });

  it('trial used up: free tier, trial "used" once over TRIAL_SHOW_LIMIT', () => {
    const result = resolveEntitlement(baseContext({ scored_show_count: 4 }), {
      maxStaleMs: MAX_STALE_MS,
    });

    expect(result.analyticsTrial.status).toBe('used');
  });

  it('free: no paid/grant history at all', () => {
    const result = resolveEntitlement(baseContext(), { maxStaleMs: MAX_STALE_MS });

    expect(result).toMatchObject({ tier: 'free', status: 'free', source: 'none', endsAt: null });
  });

  it('expired: paid subscription ended, no grant', () => {
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: '2026-06-01T00:00:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({
      tier: 'free',
      status: 'expired',
      source: 'none',
      endsAt: '2026-06-01T00:00:00.000Z',
      canManageBilling: false,
    });
  });

  it('expired: grant ended, no paid subscription', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'founding',
        grant_status: 'expired',
        grant_ends_at: '2026-05-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({
      tier: 'free',
      status: 'expired',
      endsAt: '2026-05-01T00:00:00.000Z',
    });
  });

  it('expired: revoked grant is treated as ended (access is over)', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'complimentary',
        grant_status: 'revoked',
        grant_ends_at: '2026-07-10T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.status).toBe('expired');
  });

  it('expired: a revoked grant with a FUTURE scheduled ends_at reports NO end date (never a moving one)', () => {
    // The revocation cut access short, the sanitized context omits revoked_at,
    // and clamping to evaluated_at would move the reported end date on every
    // refresh. The only truthful answer is "ended, date unknown".
    const context: Partial<OwnEntitlementContext> = {
      grant_type: 'complimentary',
      grant_status: 'revoked',
      grant_ends_at: '2026-07-30T00:00:00.000Z',
    };
    const first = resolveEntitlement(baseContext(context), { maxStaleMs: MAX_STALE_MS });
    const later = resolveEntitlement(
      baseContext({ ...context, evaluated_at: '2026-07-25T09:30:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(first.status).toBe('expired');
    expect(first.endsAt).toBeNull();
    // Stable across refreshes at different server times.
    expect(later.endsAt).toBeNull();
  });

  it('expired: superseded grant is treated as ended (access is over)', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'founding',
        grant_status: 'superseded',
        grant_ends_at: '2026-07-10T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.status).toBe('expired');
  });

  it('scheduled grant is NOT premium (no other active source -> free)', () => {
    const result = resolveEntitlement(
      baseContext({
        grant_type: 'founding',
        grant_status: 'scheduled',
        grant_starts_at: '2026-09-01T00:00:00.000Z',
        grant_ends_at: '2027-09-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('free');
    expect(result.status).toBe('free');
  });

  it('scheduled grant with an already-expired paid subscription -> expired, not premium', () => {
    const result = resolveEntitlement(
      baseContext({
        paid_tier: 'premium',
        paid_expires_at: '2026-06-01T00:00:00.000Z',
        grant_type: 'complimentary',
        grant_status: 'scheduled',
        grant_starts_at: '2026-09-01T00:00:00.000Z',
        grant_ends_at: '2027-09-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('free');
    expect(result.status).toBe('expired');
  });

  it('multiple-source precedence: active paid wins over active grant', () => {
    const result = resolveEntitlement(
      baseContext({
        paid_tier: 'premium',
        paid_expires_at: '2026-08-24T12:00:00.000Z',
        grant_type: 'founding',
        grant_status: 'active',
        grant_ends_at: '2027-01-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.source).toBe('paid');
    expect(result.canManageBilling).toBe(true);
  });

  it('multiple-source precedence: active paid wins even when the grant already expired', () => {
    const result = resolveEntitlement(
      baseContext({
        paid_tier: 'premium',
        paid_expires_at: '2026-08-24T12:00:00.000Z',
        grant_type: 'founding',
        grant_status: 'expired',
        grant_ends_at: '2026-06-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({ tier: 'premium', source: 'paid' });
  });

  it('expired precedence: picks the more recent of two ended sources', () => {
    const result = resolveEntitlement(
      baseContext({
        paid_tier: 'premium',
        paid_expires_at: '2026-05-01T00:00:00.000Z',
        grant_type: 'founding',
        grant_status: 'expired',
        grant_ends_at: '2026-06-15T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.status).toBe('expired');
    expect(result.endsAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('paid_tier "free" with a future subscription_expires_at does NOT resolve as premium (mirrors has_effective_premium_access)', () => {
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'free', paid_expires_at: '2026-08-24T12:00:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('free');
    expect(result.status).toBe('free');
  });

  it('paid_tier "free" with a past subscription_expires_at resolves as free, not expired', () => {
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'free', paid_expires_at: '2026-06-01T00:00:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('free');
    expect(result.status).toBe('free');
  });

  it('paid_tier "pro" (legacy) with a future expiry resolves as active premium, source paid', () => {
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'pro', paid_expires_at: '2026-08-24T12:00:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result).toMatchObject({ tier: 'premium', status: 'active', source: 'paid' });
  });

  it('server-time boundary: paid_expires_at exactly equal to evaluated_at is NOT active', () => {
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: EVALUATED_AT }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('free');
    expect(result.status).toBe('expired');
  });

  it('server-time boundary: paid_expires_at one millisecond after evaluated_at IS active', () => {
    const oneMsLater = new Date(Date.parse(EVALUATED_AT) + 1).toISOString();
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: oneMsLater }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(result.tier).toBe('premium');
    expect(result.status).toBe('active');
  });

  it('bounded stale access: trustedUntil is capped by the active source end when sooner than maxStaleMs', () => {
    const sourceEnd = new Date(Date.parse(EVALUATED_AT) + 60 * 1000).toISOString(); // 1 min
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: sourceEnd }),
      { maxStaleMs: MAX_STALE_MS } // 5 min
    );

    expect(result.trustedUntil).toBe(sourceEnd);
  });

  it('bounded stale access: trustedUntil is capped by maxStaleMs when the source end is later', () => {
    const sourceEnd = new Date(Date.parse(EVALUATED_AT) + 60 * 60 * 1000).toISOString(); // 1 hr
    const result = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: sourceEnd }),
      { maxStaleMs: MAX_STALE_MS } // 5 min
    );

    expect(result.trustedUntil).toBe(
      new Date(Date.parse(EVALUATED_AT) + MAX_STALE_MS).toISOString()
    );
  });

  it('bounded stale access: free/expired results are bounded by maxStaleMs only (no source end)', () => {
    const result = resolveEntitlement(baseContext(), { maxStaleMs: MAX_STALE_MS });

    expect(result.trustedUntil).toBe(
      new Date(Date.parse(EVALUATED_AT) + MAX_STALE_MS).toISOString()
    );
  });

  it('canManageBilling is true ONLY for source paid', () => {
    const founding = resolveEntitlement(
      baseContext({
        grant_type: 'founding',
        grant_status: 'active',
        grant_ends_at: '2027-01-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );
    const complimentary = resolveEntitlement(
      baseContext({
        grant_type: 'complimentary',
        grant_status: 'active',
        grant_ends_at: '2027-01-01T00:00:00.000Z',
      }),
      { maxStaleMs: MAX_STALE_MS }
    );
    const free = resolveEntitlement(baseContext(), { maxStaleMs: MAX_STALE_MS });
    const expired = resolveEntitlement(
      baseContext({ paid_tier: 'premium', paid_expires_at: '2026-06-01T00:00:00.000Z' }),
      { maxStaleMs: MAX_STALE_MS }
    );

    expect(founding.canManageBilling).toBe(false);
    expect(complimentary.canManageBilling).toBe(false);
    expect(free.canManageBilling).toBe(false);
    expect(expired.canManageBilling).toBe(false);
  });
});
