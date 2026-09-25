import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: supabaseFrom },
}));

import {
  loadPlatformPayoutLedgerEntryPage,
  loadShowsByIds,
  loadPayoutsByShowIds,
} from './usePlatformPayoutLedger';

describe('loadPlatformPayoutLedgerEntryPage', () => {
  beforeEach(() => {
    supabaseFrom.mockReset();
  });

  // 20260722160000 and 20260918041700 are applied; MYK9-654 retired the
  // retry ladder. One select names both columns, and a schema error is a
  // failure, not a quiet fallback that inflates the unresolved count.
  it('selects refund_decision and withdrawal_reason_code once, with no retry', async () => {
    const selects: string[] = [];
    const schemaError = { code: '42703', message: 'column entries.refund_decision does not exist' };
    supabaseFrom.mockImplementation(() => {
      const query = {
        select: vi.fn((select: string) => {
          selects.push(select);
          return query;
        }),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() => Promise.resolve({ data: null, error: schemaError })),
      };
      return query;
    });

    await expect(loadPlatformPayoutLedgerEntryPage(0, 999)).rejects.toBe(schemaError);
    expect(selects).toHaveLength(1);
    expect(selects[0]).toContain('refund_decision');
    expect(selects[0]).toContain('withdrawal_reason_code');
  });
});

/**
 * Both joined reads must survive PostgREST's 1000-row cap.
 *
 * This is not a theoretical robustness concern. Since a missing `shows` row now
 * MEANS "we could not read this show", a truncated read is indistinguishable
 * from an unreadable one — so truncation would label readable shows unavailable.
 * Worse on the payout side: a truncated COMPLETED payout row makes its show fall
 * back to the computed liability with payoutStatus null, moving money that has
 * already been transferred out of "paid out" and into "outstanding".
 */
describe('joined reads are paginated', () => {
  beforeEach(() => {
    supabaseFrom.mockReset();
  });

  it('chunks show ids so a one-row-per-id read cannot truncate', async () => {
    const batches: string[][] = [];
    supabaseFrom.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        in: vi.fn((_col: string, ids: string[]) => {
          batches.push(ids);
          return Promise.resolve({
            data: ids.map(id => ({
              id,
              name: `Show ${id}`,
              club_id: null,
              end_date: null,
              club: null,
            })),
            error: null,
          });
        }),
      };
      return query;
    });

    const ids = Array.from({ length: 1200 }, (_, i) => `s${i}`);
    const rows = await loadShowsByIds(ids);

    expect(rows).toHaveLength(1200);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(500);
  });

  it('range-paginates payouts, because failed retries accumulate per show', async () => {
    // One chunk of shows can hold more than 1000 payout rows, so chunking alone
    // is not enough here.
    const ranges: Array<[number, number]> = [];
    const orderCols: string[] = [];
    supabaseFrom.mockImplementation(() => {
      const query = {
        select: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn((col: string) => {
          orderCols.push(col);
          return query;
        }),
        range: vi.fn((from: number, to: number) => {
          ranges.push([from, to]);
          // First page full (forces another request), second page short.
          const count = from === 0 ? 1000 : 3;
          return Promise.resolve({
            data: Array.from({ length: count }, (_, i) => ({
              show_id: 'show-1',
              amount_cents: 100,
              status: 'completed',
              stripe_transfer_id: `tr_${from + i}`,
              completed_at: null,
              created_at: null,
            })),
            error: null,
          });
        }),
      };
      return query;
    });

    const rows = await loadPayoutsByShowIds(['show-1']);

    expect(rows).toHaveLength(1003);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    // Append-stable sort key: a random-UUID `id` alone lets a concurrent cron
    // insert reorder pages mid-scan, duplicating one row and dropping another.
    expect(orderCols).toContain('created_at');
    expect(orderCols).toContain('id');
    expect(orderCols.indexOf('created_at')).toBeLessThan(orderCols.indexOf('id'));
  });
});
