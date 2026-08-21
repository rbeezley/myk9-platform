/**
 * The financial RPC wrapper must call `rpc` AS A METHOD, on its receiver.
 *
 * `const rpc = supabase.rpc; rpc(fn, args)` detaches the function. supabase-js's
 * implementation is `return this.rest.rpc(fn, args, options)`
 * (SupabaseClient.ts:514 in 2.112.3), so a detached call throws
 * `TypeError: Cannot read properties of undefined (reading 'rest')` before it
 * issues any request.
 *
 * This shipped to production and took down every financial reconciliation
 * surface -- club and site-admin alike. It was invisible for the worst possible
 * reason: React Query caught the throw into `isError`, so there was no console
 * error, no failed network request, and nothing in the Postgres or edge logs.
 * The card just said it could not confirm the details against Stripe. The error
 * was only recoverable from the live React Query cache.
 *
 * The mock below mirrors the library: its `rpc` reads `this.rest`. If anyone
 * re-detaches the method, these tests throw exactly as production did. A source
 * grep could not do this -- it would only prove someone typed the right thing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];

vi.mock('@/lib/supabase', () => {
  const client = {
    rest: { marker: 'postgrest' },
    rpc(this: unknown, fn: string, args: Record<string, unknown>) {
      const self = this as { rest?: unknown } | undefined;
      if (!self || !self.rest) {
        // The exact failure mode, reproduced rather than described.
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      calls.push({ fn, args });
      return Promise.resolve({ data: [], error: null });
    },
  };
  return { supabase: client };
});

const {
  fetchFinancialReconciliationOrders,
  fetchFinancialReconciliationPayouts,
  fetchFinancialReconciliationSummary,
} = await import('./financialReconciliation');

describe('financial RPCs are invoked on their receiver', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it('orders: reaches the client instead of throwing on a detached `this`', async () => {
    await expect(
      fetchFinancialReconciliationOrders({ scope: 'club', clubId: 'club-1' })
    ).resolves.toEqual([]);
    expect(calls.map(c => c.fn)).toEqual(['financial_reconciliation_orders']);
  });

  it('payouts: reaches the client', async () => {
    await expect(
      fetchFinancialReconciliationPayouts({ scope: 'club', clubId: 'club-1' })
    ).resolves.toEqual([]);
    expect(calls.map(c => c.fn)).toEqual(['financial_reconciliation_payouts']);
  });

  it('summary: reaches the client', async () => {
    // The site-admin surfaces (usePlatformFinancialOverview, platformAttention)
    // route through this same wrapper, which is why one detached reference took
    // down the club page AND the platform financial views together.
    await expect(fetchFinancialReconciliationSummary({ scope: 'platform' })).resolves.toBeTruthy();
    expect(calls.map(c => c.fn)).toEqual(['financial_reconciliation_summary']);
  });

  it('passes the scope arguments through to the RPC', async () => {
    await fetchFinancialReconciliationOrders({ scope: 'club', clubId: 'club-9' });
    expect(calls[0].args).toMatchObject({ p_scope: 'club', p_club_id: 'club-9', p_show_id: null });
  });
});
