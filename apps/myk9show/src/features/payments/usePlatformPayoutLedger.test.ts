import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseFrom = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({
  supabase: { from: supabaseFrom },
}));

import { loadPlatformPayoutLedgerEntryPage } from './usePlatformPayoutLedger';

describe('loadPlatformPayoutLedgerEntryPage', () => {
  beforeEach(() => {
    supabaseFrom.mockReset();
  });

  it('retries without refund_decision when the migration is not deployed', async () => {
    const selects: string[] = [];
    supabaseFrom.mockImplementation(() => {
      const query = {
        select: vi.fn((select: string) => {
          selects.push(select);
          return query;
        }),
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi.fn(() =>
          Promise.resolve(
            selects.at(-1)?.includes('refund_decision')
              ? {
                  data: null,
                  error: {
                    code: '42703',
                    message: 'column entries.refund_decision does not exist',
                  },
                }
              : {
                  data: [
                    {
                      show_id: 'show-1',
                      entry_status: 'scratched',
                      entry_fee: 25,
                      payment_method: 'online',
                      payment_status: 'paid',
                      refund_amount: null,
                    },
                  ],
                  error: null,
                }
          )
        ),
      };
      return query;
    });

    await expect(loadPlatformPayoutLedgerEntryPage(0, 999)).resolves.toEqual([
      expect.objectContaining({ show_id: 'show-1', refund_decision: null }),
    ]);
    expect(selects).toHaveLength(2);
    expect(selects[0]).toContain('refund_decision');
    expect(selects[1]).not.toContain('refund_decision');
  });
});
