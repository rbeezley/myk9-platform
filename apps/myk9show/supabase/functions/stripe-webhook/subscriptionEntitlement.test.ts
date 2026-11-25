// @vitest-environment node
// MYK9-2338 review: the profile tier comes from every subscription the
// customer has now, so a retried event about an old canceled subscription
// cannot downgrade the premium tier a replacement granted.
import { describe, expect, it } from 'vitest';
import { currentEntitlement } from './subscriptionEntitlement';

const tierOf = (priceId: string | undefined) => (priceId === 'price_premium' ? 'premium' : 'free');
const END_1 = 1_800_000_000;
const END_2 = 1_810_000_000;

describe('currentEntitlement', () => {
  it('keeps premium from a replacement when the named subscription was canceled', () => {
    expect(
      currentEntitlement(
        [
          { status: 'canceled', priceId: 'price_premium', currentPeriodEnd: END_1 },
          { status: 'active', priceId: 'price_premium', currentPeriodEnd: END_2 },
        ],
        tierOf
      )
    ).toEqual({ tier: 'premium', expiresAt: new Date(END_2 * 1000).toISOString() });
  });

  it('is free with no expiry when nothing is active or trialing', () => {
    expect(
      currentEntitlement(
        [
          { status: 'canceled', priceId: 'price_premium', currentPeriodEnd: END_1 },
          { status: 'incomplete_expired', priceId: 'price_premium', currentPeriodEnd: END_2 },
        ],
        tierOf
      )
    ).toEqual({ tier: 'free', expiresAt: null });
  });

  it('counts trialing as entitling', () => {
    expect(
      currentEntitlement(
        [{ status: 'trialing', priceId: 'price_premium', currentPeriodEnd: END_1 }],
        tierOf
      )
    ).toEqual({ tier: 'premium', expiresAt: new Date(END_1 * 1000).toISOString() });
  });

  it('prefers a premium subscription over an active unknown price', () => {
    expect(
      currentEntitlement(
        [
          { status: 'active', priceId: 'price_other', currentPeriodEnd: END_2 },
          { status: 'active', priceId: 'price_premium', currentPeriodEnd: END_1 },
        ],
        tierOf
      )
    ).toEqual({ tier: 'premium', expiresAt: new Date(END_1 * 1000).toISOString() });
  });

  it('an active unknown price alone is free with its period end (the previous behavior)', () => {
    expect(
      currentEntitlement(
        [{ status: 'active', priceId: undefined, currentPeriodEnd: END_1 }],
        tierOf
      )
    ).toEqual({ tier: 'free', expiresAt: new Date(END_1 * 1000).toISOString() });
  });
});
