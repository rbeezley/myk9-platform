import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import { verifySubscriptionOwnership } from './subscriptionOwnership';

type Row = Record<string, unknown>;

// In-memory tables whose query builder honors every .eq() filter, so a row
// from the other Stripe mode is only refused if the real query filters on it.
function makeClient(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      single: async () => {
        const matches = (tables[table] ?? []).filter(row =>
          filters.every(([column, value]) => row[column] === value)
        );
        return matches.length === 1
          ? { data: matches[0], error: null }
          : { data: null, error: { message: `expected one row, got ${matches.length}` } };
      },
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

function tablesWithCustomerIn(livemode: boolean) {
  return {
    stripe_subscriptions: [{ id: 'row_sub', stripe_subscription_id: 'sub_123', customer_id: 'c1' }],
    stripe_customers: [{ id: 'c1', person_id: 'p1', livemode }],
    people: [{ id: 'p1', auth_user_id: 'user_1' }],
  };
}

const params = { subscriptionId: 'sub_123', authUserId: 'user_1' };

describe('verifySubscriptionOwnership', () => {
  it('accepts the owner when the customer row matches the running key mode', async () => {
    const result = await verifySubscriptionOwnership(makeClient(tablesWithCustomerIn(true)), {
      ...params,
      stripeLivemode: true,
    });

    expect(result).toEqual({ ok: true });
  });

  it('refuses a live key against a test-mode customer row', async () => {
    const result = await verifySubscriptionOwnership(makeClient(tablesWithCustomerIn(false)), {
      ...params,
      stripeLivemode: true,
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Subscription not found' });
  });

  it('refuses a test key against a live-mode customer row', async () => {
    const result = await verifySubscriptionOwnership(makeClient(tablesWithCustomerIn(true)), {
      ...params,
      stripeLivemode: false,
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Subscription not found' });
  });

  it('refuses a caller who does not own the customer', async () => {
    const result = await verifySubscriptionOwnership(makeClient(tablesWithCustomerIn(false)), {
      subscriptionId: 'sub_123',
      authUserId: 'someone_else',
      stripeLivemode: false,
    });

    expect(result).toEqual({ ok: false, status: 403, error: 'Not authorized' });
  });
});
