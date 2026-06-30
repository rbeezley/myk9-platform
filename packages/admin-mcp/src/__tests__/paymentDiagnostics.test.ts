import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import { diagnosePayment } from '../diagnostics/paymentDiagnostics';
import type { ToolContext } from '../tools/index';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

const ENTRY_ID = '22222222-2222-4222-8222-222222222222';

type QueryResult = { data: unknown; error: unknown };
interface FilterCall {
  table: string;
  method: string;
  col?: string;
}

function makeCtx(
  spec: { entries?: QueryResult; stripe_orders?: QueryResult },
  calls?: FilterCall[],
): ToolContext {
  const supabase = {
    from(table: string) {
      const result =
        (spec as Record<string, QueryResult | undefined>)[table] ?? {
          data: null,
          error: null,
        };
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.returns = chain;
      builder.eq = (col: string) => {
        calls?.push({ table, method: 'eq', col });
        return builder;
      };
      builder.contains = (col: string) => {
        calls?.push({ table, method: 'contains', col });
        return builder;
      };
      builder.maybeSingle = () => Promise.resolve(result);
      builder.then = (
        resolve: (value: QueryResult) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result).then(resolve, reject);
      return builder;
    },
  };
  return { config: CONFIG, supabase: supabase as unknown as AdminSupabaseClient };
}

function order(overrides: Record<string, unknown>) {
  return {
    id: 'order-1',
    status: 'succeeded',
    amount_cents: 4200,
    currency: 'usd',
    paid_at: '2026-06-01T00:00:00Z',
    refunded_at: null,
    entry_ids: [ENTRY_ID],
    show_id: 'show-1',
    order_type: 'entry',
    stripe_payment_intent_id: 'pi_abc123def456',
    stripe_checkout_session_id: 'cs_abc123def456',
    ...overrides,
  };
}

const PAID_ENTRY: QueryResult = {
  data: { id: ENTRY_ID, payment_status: 'paid', show_id: 'show-1' },
  error: null,
};

describe('diagnosePayment', () => {
  it('looks up by entryId via array containment and derives the amount from cents', async () => {
    const calls: FilterCall[] = [];
    const ctx = makeCtx(
      { entries: PAID_ENTRY, stripe_orders: { data: [order({})], error: null } },
      calls,
    );
    const result = await diagnosePayment({ entryId: ENTRY_ID }, ctx);

    expect(result.state).toBe('found');
    expect(result.summary).toMatchObject({ amount: '42.00 USD', onlineOrderFound: true });
    // entry_ids is uuid[], so the lookup must use containment, not equality.
    expect(
      calls.some(
        (c) => c.table === 'stripe_orders' && c.method === 'contains' && c.col === 'entry_ids',
      ),
    ).toBe(true);
  });

  it('looks up by payment intent id', async () => {
    const ctx = makeCtx({ stripe_orders: { data: [order({})], error: null } });
    const result = await diagnosePayment({ paymentIntentId: 'pi_abc123def456' }, ctx);
    expect(result.state).toBe('found');
  });

  it('looks up by checkout session id', async () => {
    const ctx = makeCtx({ stripe_orders: { data: [order({})], error: null } });
    const result = await diagnosePayment({ checkoutSessionId: 'cs_abc123def456' }, ctx);
    expect(result.state).toBe('found');
  });

  it('returns ambiguous when multiple orders match', async () => {
    const ctx = makeCtx({
      entries: PAID_ENTRY,
      stripe_orders: { data: [order({ id: 'a' }), order({ id: 'b' })], error: null },
    });
    expect((await diagnosePayment({ entryId: ENTRY_ID }, ctx)).state).toBe('ambiguous');
  });

  it('flags a paid entry with no Stripe order (mail/check/manual is valid)', async () => {
    const ctx = makeCtx({ entries: PAID_ENTRY, stripe_orders: { data: [], error: null } });
    const result = await diagnosePayment({ entryId: ENTRY_ID }, ctx);
    expect(result.state).toBe('found');
    expect(result.limitations.join(' ')).toContain('mail, check, or manual');
  });

  it('returns source_unavailable when the orders query errors', async () => {
    const ctx = makeCtx({
      entries: { data: { id: ENTRY_ID, payment_status: 'pending', show_id: 'show-1' }, error: null },
      stripe_orders: { data: null, error: { code: 'PGRST' } },
    });
    expect((await diagnosePayment({ entryId: ENTRY_ID }, ctx)).state).toBe(
      'source_unavailable',
    );
  });
});
