import { describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useEntriesPanelGroups, useRemoveEntryLine } from './useEntriesPanelData';
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

// Replication-backed stores for `useEntriesPanelGroups`. The class query
// (`useClassStoreCompat`) is a PostgREST read and returns nothing here — the
// cold/offline secretary late-entry case — while the replicated
// `trialClasses` slice holds the class.
const trialClassesMock = vi.hoisted(() => ({ current: {} as Record<string, unknown[]> }));
const queryClassesMock = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [{ id: 'dog-1', name: 'Rex', callName: 'Rex' }] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: queryClassesMock.current }),
}));
vi.mock('@/store/trialStore', () => ({
  useTrialStore: (
    selector: (state: { trials: unknown[]; trialClasses: Record<string, unknown[]> }) => unknown
  ) =>
    selector({
      trials: [{ id: 'trial-1', name: 'Trial 1', trialDate: '2026-08-01' }],
      trialClasses: trialClassesMock.current,
    }),
}));

describe('useEntriesPanelGroups', () => {
  const feeCalculation = {
    subtotal: 30,
    discounts: [],
    taxes: 0,
    total: 30,
    breakdown: [
      {
        dogId: 'dog-1',
        dogName: 'Rex',
        subtotal: 30,
        classes: [{ classId: 'class-1', className: 'Interior Advanced', fee: 30 }],
      },
    ],
  };

  it('labels a line from the replicated trial classes when the class query has nothing', () => {
    queryClassesMock.current = [];
    trialClassesMock.current = {
      'trial-1': [{ id: 'class-1', element: 'Interior', level: 'Advanced', section: '' }],
    };

    const { result } = renderHook(() =>
      useEntriesPanelGroups({ selectedDogIds: ['dog-1'], feeCalculation })
    );

    expect(result.current[0]?.lines[0]).toMatchObject({
      label: 'Interior Advanced',
      dayLabel: 'Sat',
    });
  });

  it('falls back to the class query for a class replication does not hold', () => {
    trialClassesMock.current = {};
    queryClassesMock.current = [
      { id: 'class-1', trialId: 'trial-1', element: 'Interior', level: 'Advanced', section: '' },
    ];

    const { result } = renderHook(() =>
      useEntriesPanelGroups({ selectedDogIds: ['dog-1'], feeCalculation })
    );

    expect(result.current[0]?.lines[0]).toMatchObject({
      label: 'Interior Advanced',
      dayLabel: 'Sat',
    });
  });
});

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
