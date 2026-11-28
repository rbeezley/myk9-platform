// @vitest-environment node
// MYK9-2497: the profile tier comes from the customer's entitling
// subscription (the oldest active or trialing one), not from whichever
// subscription the event was about. A duplicate grants nothing, and
// cancelling it leaves the customer on the kept subscription's tier and
// expiry instead of dropping them to free.
import { describe, expect, it, vi } from 'vitest';
import {
  syncSubscriptionFromStripe,
  type SyncDeps,
  type SyncedSubscription,
} from './subscriptionSync';

const DAY = 86_400;

function sub(id: string, status: string, created: number, periodEnd: number): SyncedSubscription {
  return {
    id,
    status,
    created,
    current_period_start: created,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    canceled_at: status === 'canceled' ? created + DAY : null,
    items: { data: [{ price: { id: 'price_premium' } }] },
  };
}

const KEPT = sub('sub_kept', 'active', 1_000_000, 1_000_000 + 30 * DAY);
const DUP = sub('sub_dup', 'active', 1_000_000 + DAY, 1_000_000 + 31 * DAY);

function harness(subscriptions: SyncedSubscription[]) {
  const upserts: Record<string, unknown>[] = [];
  const profileUpdates: Record<string, unknown>[] = [];
  const db = {
    from: vi.fn((table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: table === 'stripe_customers' ? { id: 'cust-row', person_id: 'person-1' } : null,
            error: null,
          }),
        }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          if (table === 'exhibitor_profiles') profileUpdates.push(values);
          return { error: null };
        },
      }),
      upsert: async (values: Record<string, unknown>) => {
        upserts.push(values);
        return { error: null };
      },
    })),
  };
  // Stripe lists newest first.
  const listed = [...subscriptions].sort((a, b) => b.created - a.created);
  const deps: SyncDeps = {
    db,
    stripe: {
      subscriptions: {
        list: vi.fn(async () => ({ data: listed, has_more: false })),
        retrieve: vi.fn(async (id: string) => {
          const found = subscriptions.find(s => s.id === id);
          if (!found) throw new Error(`no ${id}`);
          return found;
        }),
      },
    },
    mapPriceToTier: priceId => (priceId === 'price_premium' ? 'premium' : 'free'),
  };
  return { deps, upserts, profileUpdates };
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

describe('syncSubscriptionFromStripe', () => {
  it('writes the duplicate row as Stripe has it but takes the tier and expiry from the kept one', async () => {
    const h = harness([KEPT, DUP]);

    await syncSubscriptionFromStripe(h.deps, 'cus_1', 'sub_dup');

    expect(h.upserts).toEqual([
      expect.objectContaining({ stripe_subscription_id: 'sub_dup', status: 'active' }),
    ]);
    expect(h.profileUpdates).toEqual([
      { subscription_tier: 'premium', subscription_expires_at: iso(KEPT.current_period_end) },
    ]);
  });

  it('cancelling the duplicate leaves the customer on the kept subscription', async () => {
    const h = harness([KEPT, { ...DUP, status: 'canceled', canceled_at: DUP.created + DAY }]);

    await syncSubscriptionFromStripe(h.deps, 'cus_1', 'sub_dup');

    expect(h.upserts).toEqual([
      expect.objectContaining({ stripe_subscription_id: 'sub_dup', status: 'canceled' }),
    ]);
    expect(h.profileUpdates).toEqual([
      { subscription_tier: 'premium', subscription_expires_at: iso(KEPT.current_period_end) },
    ]);
  });

  it('drops to free when no subscription is active or trialing', async () => {
    const h = harness([{ ...KEPT, status: 'canceled' }]);

    await syncSubscriptionFromStripe(h.deps, 'cus_1', 'sub_kept');

    expect(h.profileUpdates).toEqual([
      { subscription_tier: 'free', subscription_expires_at: null },
    ]);
  });

  it('returns the subscriptions with the event one at its freshest state', async () => {
    const h = harness([KEPT, DUP]);
    const fresh = { ...DUP, status: 'past_due' };
    vi.mocked(h.deps.stripe.subscriptions.retrieve).mockResolvedValueOnce(fresh);

    const all = await syncSubscriptionFromStripe(h.deps, 'cus_1', 'sub_dup');

    expect(all?.map(s => `${s.id}:${s.status}`)).toEqual(['sub_dup:past_due', 'sub_kept:active']);
  });

  it('without a known id syncs the newest subscription, as before', async () => {
    const h = harness([KEPT, DUP]);

    await syncSubscriptionFromStripe(h.deps, 'cus_1');

    expect(h.upserts).toEqual([expect.objectContaining({ stripe_subscription_id: 'sub_dup' })]);
    expect(h.deps.stripe.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('records the no-subscription state when the customer has none', async () => {
    const h = harness([]);

    expect(await syncSubscriptionFromStripe(h.deps, 'cus_1')).toBeNull();
    expect(h.upserts).toEqual([
      { customer_id: 'cust-row', stripe_subscription_id: 'none_cus_1', status: 'none' },
    ]);
    expect(h.profileUpdates).toEqual([
      { subscription_tier: 'free', subscription_expires_at: null },
    ]);
  });
});
