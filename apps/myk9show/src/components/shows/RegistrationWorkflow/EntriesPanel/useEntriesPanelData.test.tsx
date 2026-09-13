import { describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRemoveEntryLine } from './useEntriesPanelData';
import type { ClassSelectionData } from '@/types/show-registration-types';

/**
 * Ported from the retired `PaymentStep/__tests__/PaymentStep.removeLine.test.tsx`
 * when the fee-line list moved into the entries panel: the behaviour it pinned
 * — the cart row goes first, then the wizard's own selection — is unchanged,
 * only its home moved. The 44px remove control itself is pinned in
 * `EntriesPanel.test.tsx`.
 */
const removeItemMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/store/cartStore', () => ({
  useCartItems: () => [{ id: 'item-1', dog_id: 'dog-1', class_id: 'class-1' }],
  useCartStore: (selector: (state: { removeItem: typeof removeItemMock }) => unknown) =>
    selector({ removeItem: removeItemMock }),
}));

vi.mock('sonner', () => ({ toast: { error: toastError } }));

const classSelections: ClassSelectionData[] = [
  { dogId: 'dog-1', trialId: 'trial-1', selectedClasses: [{ classId: 'class-1' }] },
];

describe('useRemoveEntryLine', () => {
  it('removes the cart line and the matching class selection', async () => {
    const onClassSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useRemoveEntryLine(classSelections, onClassSelectionChange)
    );

    await act(async () => {
      await result.current.removeLine('dog-1', 'class-1');
    });

    expect(removeItemMock).toHaveBeenCalledWith('item-1');
    expect(onClassSelectionChange).toHaveBeenCalledWith([]);
    await waitFor(() => expect(result.current.removingLineKey).toBeNull());
  });

  it('leaves the selection alone when the cart removal fails', async () => {
    removeItemMock.mockResolvedValueOnce(false);
    const onClassSelectionChange = vi.fn();
    const { result } = renderHook(() =>
      useRemoveEntryLine(classSelections, onClassSelectionChange)
    );

    await act(async () => {
      await result.current.removeLine('dog-1', 'class-1');
    });

    expect(onClassSelectionChange).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Failed to remove from cart');
  });

  it('does nothing without a selection handler', async () => {
    const { result } = renderHook(() => useRemoveEntryLine(classSelections, undefined));

    await act(async () => {
      await result.current.removeLine('dog-1', 'class-1');
    });

    expect(result.current.removingLineKey).toBeNull();
  });
});
