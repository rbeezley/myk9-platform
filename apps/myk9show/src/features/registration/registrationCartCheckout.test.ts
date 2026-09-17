import { describe, expect, it, vi } from 'vitest';
import { submitRegistrationCartCheckout } from './registrationCartCheckout';

function makeDeps() {
  return {
    clearCart: vi.fn().mockResolvedValue(true),
    ensureCart: vi.fn().mockResolvedValue({ id: 'cart-1', items: [] }),
    addItem: vi.fn().mockResolvedValue(true),
    abandonCart: vi.fn().mockResolvedValue(true),
    navigate: vi.fn(),
  };
}

describe('submitRegistrationCartCheckout', () => {
  it('creates a cart using exhibitorProfileId (not ownerId), adds items, keeps the draft, navigates', async () => {
    const deps = makeDeps();

    await submitRegistrationCartCheckout({
      showId: 'show-1',
      ownerResolution: { ok: true, ownerId: 'people-1' },
      exhibitorProfileId: 'profile-1',
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1', jumpHeight: '16' }],
        },
      ],
      handlerAssignments: {
        'dog-1|class-1': { handlerId: 'handler-1', handlerName: 'Pat Handler', isOwner: false },
      },
      classes: [{ id: 'class-1', entryFee: 20 }],
      showFeeInfo: {
        preEntryFee: '25',
        dayOfShowFee: '30',
        startDate: '2099-05-01',
      },
      deps,
    });

    // Cart operations must use exhibitorProfileId, not ownerResolution.ownerId
    expect(deps.ensureCart).toHaveBeenCalledWith('show-1', 'profile-1');
    // A cart that came back empty has nothing to clear.
    expect(deps.clearCart).not.toHaveBeenCalled();
    expect(deps.addItem).toHaveBeenCalledWith({
      dogId: 'dog-1',
      classId: 'class-1',
      handlerId: 'handler-1',
      jumpHeight: '16',
      entryFeeCents: 2500,
    });
    expect(deps.navigate).toHaveBeenCalledWith('/cart');
  });

  it('abandons a partially populated cart when adding a later item fails', async () => {
    const deps = makeDeps();
    deps.addItem.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'people-1' },
        exhibitorProfileId: 'profile-1',
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
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('reuses and clears an existing cart before adding registration items', async () => {
    const deps = makeDeps();
    deps.ensureCart.mockResolvedValue({ id: 'cart-existing', items: [{ id: 'item-1' }] });

    await submitRegistrationCartCheckout({
      showId: 'show-1',
      ownerResolution: { ok: true, ownerId: 'people-1' },
      exhibitorProfileId: 'profile-1',
      classSelections: [
        {
          dogId: 'dog-1',
          trialId: 'trial-1',
          selectedClasses: [{ classId: 'class-1' }],
        },
      ],
      handlerAssignments: {},
      classes: [{ id: 'class-1' }],
      showFeeInfo: {
        preEntryFee: '25',
        startDate: '2099-05-01',
      },
      deps,
    });

    expect(deps.clearCart).toHaveBeenCalledTimes(1);
    expect(deps.ensureCart).toHaveBeenCalledTimes(1);
    expect(deps.addItem).toHaveBeenCalledTimes(1);
    expect(deps.navigate).toHaveBeenCalledWith('/cart');
  });

  it('stops before adding items when clearing an existing cart fails', async () => {
    const deps = makeDeps();
    deps.ensureCart.mockResolvedValue({ id: 'cart-existing', items: [{ id: 'item-1' }] });
    deps.clearCart.mockResolvedValue(false);

    await expect(
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'people-1' },
        exhibitorProfileId: 'profile-1',
        classSelections: [
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }],
          },
        ],
        handlerAssignments: {},
        classes: [{ id: 'class-1' }],
        showFeeInfo: {
          preEntryFee: '25',
          startDate: '2099-05-01',
        },
        deps,
      })
    ).rejects.toThrow('Failed to clear existing cart');

    expect(deps.addItem).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('leaves a newly empty cart in place when the first item fails to add', async () => {
    const deps = makeDeps();
    deps.addItem.mockResolvedValue(false);

    await expect(
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'people-1' },
        exhibitorProfileId: 'profile-1',
        classSelections: [
          {
            dogId: 'dog-1',
            trialId: 'trial-1',
            selectedClasses: [{ classId: 'class-1' }],
          },
        ],
        handlerAssignments: {},
        classes: [{ id: 'class-1' }],
        showFeeInfo: {
          preEntryFee: '25',
          startDate: '2099-05-01',
        },
        deps,
      })
    ).rejects.toThrow('Failed to add entry to cart');

    expect(deps.abandonCart).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it('throws when exhibitorProfileId is empty', async () => {
    const deps = makeDeps();

    await expect(
      submitRegistrationCartCheckout({
        showId: 'show-1',
        ownerResolution: { ok: true, ownerId: 'people-1' },
        exhibitorProfileId: '',
        classSelections: [],
        handlerAssignments: {},
        classes: [],
        showFeeInfo: { preEntryFee: '25', startDate: '2099-05-01' },
        deps,
      })
    ).rejects.toThrow('Cannot determine exhibitor profile');

    expect(deps.ensureCart).not.toHaveBeenCalled();
  });
});
