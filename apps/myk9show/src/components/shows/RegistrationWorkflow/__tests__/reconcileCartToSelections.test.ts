import { describe, it, expect } from 'vitest';
import { reconcileCartToSelections } from '../ClassSelectionStep.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { ClassSelectionData } from '@/types/show-registration-types';

const makeCartItem = (
  dogId: string,
  classId: string,
  trialId: string
): CartItemWithDetails =>
  ({
    id: `item-${dogId}-${classId}`,
    dog_id: dogId,
    class_id: classId,
    class: { id: classId, name: 'Test Class', level: 'Novice', trial_id: trialId },
  }) as CartItemWithDetails;

describe('reconcileCartToSelections', () => {
  it('returns null when cart is empty', () => {
    expect(reconcileCartToSelections([], [])).toBeNull();
  });

  it('returns null when all cart items are already in classSelections', () => {
    const existing: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const cartItems = [makeCartItem('d1', 'c1', 't1')];
    expect(reconcileCartToSelections(cartItems, existing)).toBeNull();
  });

  it('reconstructs classSelections from cart items not in wizard state', () => {
    const cartItems = [makeCartItem('d1', 'c1', 't1'), makeCartItem('d1', 'c2', 't1')];
    const result = reconcileCartToSelections(cartItems, []);
    expect(result).toEqual([
      {
        dogId: 'd1',
        trialId: 't1',
        selectedClasses: [
          { classId: 'c1', jumpHeight: undefined, moveUpRequested: false },
          { classId: 'c2', jumpHeight: undefined, moveUpRequested: false },
        ],
      },
    ]);
  });

  it('groups missing cart items by dog', () => {
    const cartItems = [makeCartItem('d1', 'c1', 't1'), makeCartItem('d2', 'c2', 't1')];
    const result = reconcileCartToSelections(cartItems, []);
    expect(result).toHaveLength(2);
    expect(result?.find(s => s.dogId === 'd1')?.selectedClasses).toEqual([
      { classId: 'c1', jumpHeight: undefined, moveUpRequested: false },
    ]);
    expect(result?.find(s => s.dogId === 'd2')?.selectedClasses).toEqual([
      { classId: 'c2', jumpHeight: undefined, moveUpRequested: false },
    ]);
  });

  it('merges missing cart items into existing classSelections (partial-sync case)', () => {
    // Dog 1 was restored from a draft; Dog 2 only exists in the cart.
    const existing: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1', jumpHeight: '8"' }] },
    ];
    const cartItems = [makeCartItem('d1', 'c1', 't1'), makeCartItem('d2', 'c2', 't1')];
    const result = reconcileCartToSelections(cartItems, existing);
    // Dog 1's draft entry (with jump height) is preserved; Dog 2 is added.
    expect(result?.find(s => s.dogId === 'd1')?.selectedClasses).toEqual([
      { classId: 'c1', jumpHeight: '8"' },
    ]);
    expect(result?.find(s => s.dogId === 'd2')?.selectedClasses).toEqual([
      { classId: 'c2', jumpHeight: undefined, moveUpRequested: false },
    ]);
  });

  it('uses composite dog+class keys — two dogs in the same class are each synced independently', () => {
    // Dog 1 has c1 in selections; Dog 2 also needs c1 from the cart.
    // Without composite keys, Dog 2:c1 would be masked by Dog 1:c1.
    const existing: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const cartItems = [makeCartItem('d1', 'c1', 't1'), makeCartItem('d2', 'c1', 't1')];
    const result = reconcileCartToSelections(cartItems, existing);
    expect(result?.find(s => s.dogId === 'd2')?.selectedClasses).toEqual([
      { classId: 'c1', jumpHeight: undefined, moveUpRequested: false },
    ]);
  });

  it('skips cart items with missing dog_id or class_id', () => {
    const cartItems = [
      { id: 'x', dog_id: null, class_id: 'c1' } as unknown as CartItemWithDetails,
      { id: 'y', dog_id: 'd1', class_id: null } as unknown as CartItemWithDetails,
    ];
    expect(reconcileCartToSelections(cartItems, [])).toBeNull();
  });

  it('uses empty string for trialId when class join is absent', () => {
    const cartItems: CartItemWithDetails[] = [
      { id: 'z', dog_id: 'd1', class_id: 'c1' } as CartItemWithDetails,
    ];
    const result = reconcileCartToSelections(cartItems, []);
    expect(result?.[0].trialId).toBe('');
  });
});
