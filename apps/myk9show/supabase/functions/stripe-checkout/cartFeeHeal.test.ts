import { describe, expect, it, vi } from 'vitest';
import { healDriftedCart, type FeeHealDeps, type FeeHealWriteResult } from './cartFeeHeal';

const ok: FeeHealWriteResult = { error: null };
const failed: FeeHealWriteResult = { error: { message: 'permission denied', code: '42501' } };

function makeDeps(overrides: Partial<FeeHealDeps> = {}) {
  const deps = {
    writeLineFee: vi.fn(async (): Promise<FeeHealWriteResult> => ok),
    writeCartTotals: vi.fn(async (): Promise<FeeHealWriteResult> => ok),
    expirePriorSession: vi.fn(async () => undefined),
    logError: vi.fn(),
    ...overrides,
  };
  return deps;
}

const lines = [
  { itemId: 'item-1', authoritativeCents: 3000 },
  { itemId: 'item-2', authoritativeCents: 2500 },
];

describe('healDriftedCart', () => {
  it('writes every drifted line at its authoritative fee, then the totals, and reports healed', async () => {
    const deps = makeDeps();
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'healed' });
    expect(deps.writeLineFee).toHaveBeenCalledWith('item-1', 3000);
    expect(deps.writeLineFee).toHaveBeenCalledWith('item-2', 2500);
    expect(deps.writeCartTotals).toHaveBeenCalledTimes(1);
    expect(deps.expirePriorSession).toHaveBeenCalledTimes(1);
    expect(deps.logError).not.toHaveBeenCalled();
  });

  it('reports heal_failed (never healed) when a line write errors, so checkout is not told the fees were updated', async () => {
    const deps = makeDeps({
      writeLineFee: vi.fn(async (itemId: string) => (itemId === 'item-2' ? failed : ok)),
    });
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({
      kind: 'heal_failed',
      failedItemIds: ['item-2'],
    });
    expect(deps.logError).toHaveBeenCalledWith(
      'Cart cart-1: could not heal the fee on line item-2:',
      failed.error
    );
  });

  it('still tries every line, the totals and the prior page after a line write fails', async () => {
    const deps = makeDeps({ writeLineFee: vi.fn(async () => failed) });
    await healDriftedCart('cart-1', lines, deps);
    expect(deps.writeLineFee).toHaveBeenCalledTimes(2);
    expect(deps.writeCartTotals).toHaveBeenCalledTimes(1);
    expect(deps.expirePriorSession).toHaveBeenCalledTimes(1);
  });

  it('logs a failed totals write but still reports healed, since the lines no longer drift', async () => {
    const deps = makeDeps({ writeCartTotals: vi.fn(async () => failed) });
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'healed' });
    expect(deps.logError).toHaveBeenCalledWith(
      'Cart cart-1: could not write healed totals:',
      failed.error
    );
  });

  it('swallows a failure to expire the prior page', async () => {
    const deps = makeDeps({
      expirePriorSession: vi.fn(async () => {
        throw new Error('session already completed');
      }),
    });
    expect(await healDriftedCart('cart-1', lines, deps)).toEqual({ kind: 'healed' });
  });
});
