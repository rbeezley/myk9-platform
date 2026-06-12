import { describe, expect, it, vi } from 'vitest';
import { submitRegistrationCartCheckout } from './registrationCartCheckout';

function makeDeps() {
  return {
    loadCart: vi.fn().mockResolvedValue(null),
    clearCart: vi.fn().mockResolvedValue(true),
    createCart: vi.fn().mockResolvedValue({ id: 'cart-1' }),
    addItem: vi.fn().mockResolvedValue(true),
    abandonCart: vi.fn().mockResolvedValue(true),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn(),
  };
}

describe('submitRegistrationCartCheckout', () => {
  it('creates a cart, adds registration items, deletes the draft, and navigates to cart', async () => {
    const deps = makeDeps();

    await submitRegistrationCartCheckout({
      showId: 'show-1',
      ownerResolution: { ok: true, ownerId: 'owner-1' },
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
        },
      ],
      handlerAssignments: {
        'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler' },
      },
      classes: [{ id: 'class-1', entryFee: 20 }],
      showFeeInfo: {
        preEntryFee: '25',
        dayOfShowFee: '30',
        startDate: '2099-05-01',
      },
      deps,
    });

    expect(deps.loadCart).toHaveBeenCalledWith('show-1', 'owner-1');
    expect(deps.createCart).toHaveBeenCalledWith('show-1', 'owner-1');
    expect(deps.addItem).toHaveBeenCalledWith({
      dogId: 'dog-1',
      classId: 'class-1',
      handlerId: 'handler-1',
      jumpHeight: '16',
      entryFeeCents: 2500,
    });
    expect(deps.deleteDraft).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith('/cart');
  });

  it('abandons a partially populated cart when adding a later item fails', async () => {
    const deps = makeDeps();
    deps.addItem.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'owner-1' },
        classSelections: [
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }, { classId: 'class-2' }],
          },
        ],
        handlerAssignments: {},
        classes: [{ id: 'class-1' }, { id: 'class-2' }],
        showFeeInfo: {
          preEntryFee: '25',
          startDate: '2099-05-01',
        },
        deps,
      })
    ).rejects.toThrow('Failed to add entry to cart');

    expect(deps.abandonCart).toHaveBeenCalledTimes(1);
    expect(deps.deleteDraft).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});
