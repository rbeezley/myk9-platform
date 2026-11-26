import { describe, expect, it, vi } from 'vitest';
import type { PriorSessionRelease } from '../_shared/cartClassGate';
import { healDriftedCart, type FeeHealDeps, type FeeHealWriteResult } from './cartFeeHeal';

const ok: FeeHealWriteResult = { error: null, data: [{ id: 'row' }] };
const failed: FeeHealWriteResult = {
  error: { message: 'permission denied', code: '42501' },
  data: null,
};
const noRow: FeeHealWriteResult = { error: null, data: [] };

function makeDeps(overrides: Partial<FeeHealDeps> = {}) {
  const order: string[] = [];
  const deps = {
    releasePriorSession: vi.fn(async (): Promise<PriorSessionRelease> => {
      order.push('release');
      return { kind: 'released' };
    }),
    writeLineFee: vi.fn(async (itemId: string): Promise<FeeHealWriteResult> => {
      order.push(`line:${itemId}`);
      return ok;
    }),
    writeCartTotals: vi.fn(async (): Promise<FeeHealWriteResult> => {
      order.push('totals');
      return ok;
    }),
    logError: vi.fn(),
    ...overrides,
  };
  return { deps, order };
}

const lines = [
  { itemId: 'item-1', authoritativeCents: 3000 },
  { itemId: 'item-2', authoritativeCents: 2500 },
];

describe('healDriftedCart', () => {
  it('retires the prior page, then writes every line, then the totals, and reports healed', async () => {
    const { deps, order } = makeDeps();
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'healed' });
    expect(deps.writeLineFee).toHaveBeenCalledWith('item-1', 3000);
    expect(deps.writeLineFee).toHaveBeenCalledWith('item-2', 2500);
    expect(order).toEqual(['release', 'line:item-1', 'line:item-2', 'totals']);
    expect(deps.logError).not.toHaveBeenCalled();
  });

  it.each([
    [409, 'Your payment for this entry is already processing.'],
    [503, 'We could not safely update your entry.'],
  ] as const)(
    'writes nothing when the prior page is not confirmed retired (%i)',
    async (status, error) => {
      const { deps } = makeDeps({
        releasePriorSession: vi.fn(async (): Promise<PriorSessionRelease> => ({
          kind: 'blocked',
          status,
          error,
          diagnostic: 'Checkout Session cs_1 is complete',
        })),
      });
      expect(await healDriftedCart('cart-1', lines, deps)).toEqual({
        kind: 'blocked',
        status,
        error,
      });
      expect(deps.writeLineFee).not.toHaveBeenCalled();
      expect(deps.writeCartTotals).not.toHaveBeenCalled();
    }
  );

  it.each([
    { label: 'errors', result: failed, logged: failed.error },
    { label: 'matches no row', result: noRow, logged: 'no row updated' },
  ])(
    'stops at a line write that $label, writes no totals, and reports heal_failed',
    async ({ result, logged }) => {
      const { deps } = makeDeps({
        writeLineFee: vi.fn(async (itemId: string) => (itemId === 'item-1' ? result : ok)),
      });
      expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'heal_failed' });
      expect(deps.writeLineFee).toHaveBeenCalledTimes(1);
      expect(deps.writeCartTotals).not.toHaveBeenCalled();
      expect(deps.logError).toHaveBeenCalledWith(
        'Cart cart-1: could not heal the fee on line item-1:',
        logged
      );
    }
  );

  it.each([
    { label: 'errors', result: failed, logged: failed.error },
    { label: 'matches no row', result: noRow, logged: 'no row updated' },
  ])(
    'reports heal_failed, never healed, when the totals write $label',
    async ({ result, logged }) => {
      const { deps } = makeDeps({ writeCartTotals: vi.fn(async () => result) });
      expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'heal_failed' });
      expect(deps.logError).toHaveBeenCalledWith(
        'Cart cart-1: could not write healed totals:',
        logged
      );
    }
  );
});
