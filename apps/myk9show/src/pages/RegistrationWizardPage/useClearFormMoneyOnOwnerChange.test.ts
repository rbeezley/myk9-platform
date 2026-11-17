/**
 * MYK9-2149 (Codex P2): "Use the money already on this form" is cleared when the exhibitor (so
 * the form) changes, and kept when the same exhibitor's balance refreshes.
 */
import { renderHook } from '@/test/utils/testUtils';
import { describe, expect, it, vi } from 'vitest';
import type { PaymentMethod } from '@/types/show-registration-types';
import { useClearFormMoneyOnOwnerChange } from './useClearFormMoneyOnOwnerChange';

function renderGuard(initial: { ownerId: string | undefined; method: PaymentMethod | undefined }) {
  const clear = vi.fn();
  const view = renderHook(
    ({ ownerId, method }) => useClearFormMoneyOnOwnerChange(ownerId, method, clear),
    { initialProps: initial }
  );
  return { ...view, clear };
}

describe('useClearFormMoneyOnOwnerChange (MYK9-2149)', () => {
  it("clears the form's-money choice when another exhibitor's dog is selected", () => {
    const { rerender, clear } = renderGuard({ ownerId: 'owner-1', method: 'form_money' });

    rerender({ ownerId: 'owner-2', method: 'form_money' });

    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('keeps it while the exhibitor stays the same (a balance refresh changes nothing)', () => {
    const { rerender, clear } = renderGuard({ ownerId: 'owner-1', method: 'form_money' });

    rerender({ ownerId: 'owner-1', method: 'form_money' });
    rerender({ ownerId: 'owner-1', method: 'form_money' });

    expect(clear).not.toHaveBeenCalled();
  });

  it('leaves every other choice alone when the exhibitor changes', () => {
    const { rerender, clear } = renderGuard({ ownerId: 'owner-1', method: 'secretary_paid' });

    rerender({ ownerId: 'owner-2', method: 'secretary_paid' });

    expect(clear).not.toHaveBeenCalled();
  });
});
