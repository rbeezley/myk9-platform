import { describe, it, expect, vi } from 'vitest';
import { isClassSelected, toggleClassSelection } from '../ClassSelectionStep.helpers';
import type { CartItemWithDetails } from '@/store/cartStore';
import type { ClassSelectionData } from '@/types/show-registration-types';

const makeCartItem = (dogId: string, classId: string, trialId: string): CartItemWithDetails =>
  ({
    id: `item-${dogId}-${classId}`,
    dog_id: dogId,
    class_id: classId,
    class: { id: classId, name: 'Test Class', level: 'Novice', trial_id: trialId },
  }) as CartItemWithDetails;

type ToggleOptions = Parameters<typeof toggleClassSelection>[0];

const makeHarness = (overrides: Partial<ToggleOptions> = {}) => {
  // `pending` mirrors the component's ref: `setAddingItem` writes it and
  // `isAddInFlight` reads it live, so a second click in the same tick sees the
  // first click's write rather than a stale render-time value.
  const pending = { key: null as string | null };
  const opts = {
    useCartFlow: true,
    cartItems: [] as CartItemWithDetails[],
    classSelections: [] as ClassSelectionData[],
    dogId: 'd1',
    trialId: 't1',
    classId: 'c1',
    entryFee: 30,
    onSelectionChange: vi.fn(),
    addItem: vi.fn().mockResolvedValue(true),
    removeItem: vi.fn().mockResolvedValue(true),
    setAddingItem: vi.fn((key: string | null) => {
      pending.key = key;
    }),
    isAddInFlight: () => pending.key !== null,
    isCartReady: true,
    onBlockedByCart: vi.fn(),
    notifyAdded: vi.fn(),
    notifyError: vi.fn(),
    ...overrides,
  };
  return opts;
};

describe('toggleClassSelection — the chip predicate and the toggle branch agree (MYK9-530)', () => {
  it('a chip selected only via classSelections (missing from cart.items) deselects, never adds', async () => {
    // The exact divergence from the MYK9-508 replay: the pair is in the
    // wizard's classSelections but absent from the locally-held cart list.
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const cartItems: CartItemWithDetails[] = [];

    // Premise: this is exactly what renders the chip checked.
    expect(isClassSelected('d1', 'c1', cartItems, classSelections)).toBe(true);

    const opts = makeHarness({ cartItems, classSelections });
    await toggleClassSelection(opts);

    // A selected chip must never take the ADD branch — that is the 23505.
    expect(opts.addItem).not.toHaveBeenCalled();
    // It deselects instead.
    expect(opts.onSelectionChange).toHaveBeenCalledWith([]);
    expect(opts.notifyError).not.toHaveBeenCalled();
  });

  it('a chip selected via a real cart row removes that row', async () => {
    const cartItems = [makeCartItem('d1', 'c1', 't1')];
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const opts = makeHarness({ cartItems, classSelections });
    await toggleClassSelection(opts);

    expect(opts.removeItem).toHaveBeenCalledWith('item-d1-c1');
    expect(opts.addItem).not.toHaveBeenCalled();
    expect(opts.onSelectionChange).toHaveBeenCalledWith([]);
  });

  it('a chip in the cart but absent from classSelections still removes, never adds', async () => {
    const cartItems = [makeCartItem('d1', 'c1', 't1')];
    const opts = makeHarness({ cartItems, classSelections: [] });
    expect(isClassSelected('d1', 'c1', cartItems, [])).toBe(true);

    await toggleClassSelection(opts);

    expect(opts.removeItem).toHaveBeenCalledWith('item-d1-c1');
    expect(opts.addItem).not.toHaveBeenCalled();
  });

  it('an unselected chip still adds to the cart', async () => {
    const opts = makeHarness();
    await toggleClassSelection(opts);

    expect(opts.addItem).toHaveBeenCalledWith({ dogId: 'd1', classId: 'c1', entryFeeCents: 3000 });
    expect(opts.removeItem).not.toHaveBeenCalled();
    expect(opts.notifyAdded).toHaveBeenCalled();
    expect(opts.setAddingItem).toHaveBeenNthCalledWith(1, 'd1-c1');
    expect(opts.setAddingItem).toHaveBeenNthCalledWith(2, null);
  });

  it('non-cart flow (secretary) toggles local selection only', async () => {
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const opts = makeHarness({ useCartFlow: false, classSelections });
    await toggleClassSelection(opts);

    expect(opts.addItem).not.toHaveBeenCalled();
    expect(opts.removeItem).not.toHaveBeenCalled();
    expect(opts.onSelectionChange).toHaveBeenCalledWith([]);
  });
});

describe('toggleClassSelection — the in-flight guard actually guards (MYK9-530)', () => {
  it('ignores a second click on the same chip while the add is still pending', async () => {
    let release: (v: boolean) => void = () => {};
    const addItem = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          release = resolve;
        })
    );
    const opts = makeHarness({ addItem });

    const first = toggleClassSelection(opts);
    // The chip has not re-rendered and the promise has not settled: this is the
    // double-click that used to fire a second INSERT and die on 23505. Not
    // awaited before the assertion — the add path reaches `addItem` with no
    // await ahead of it, so an unguarded second click shows up immediately.
    const second = toggleClassSelection(opts);

    expect(addItem).toHaveBeenCalledTimes(1);

    release(true);
    await Promise.all([first, second]);
    expect(addItem).toHaveBeenCalledTimes(1);
    expect(opts.notifyAdded).toHaveBeenCalledTimes(1);
  });

  it('ignores a click on a DIFFERENT chip while an add is pending', async () => {
    let release: (v: boolean) => void = () => {};
    const addItem = vi.fn(
      () =>
        new Promise<boolean>(resolve => {
          release = resolve;
        })
    );
    const opts = makeHarness({ addItem });

    const first = toggleClassSelection(opts);
    const second = toggleClassSelection({ ...opts, classId: 'c2' });

    expect(addItem).toHaveBeenCalledTimes(1);
    release(true);
    await Promise.all([first, second]);
  });

  it('accepts the next click once the add has settled', async () => {
    const opts = makeHarness();
    await toggleClassSelection(opts);
    await toggleClassSelection({ ...opts, classId: 'c2' });

    expect(opts.addItem).toHaveBeenCalledTimes(2);
  });
});

describe('toggleClassSelection — the cart-readiness gate (MYK9-542)', () => {
  it('a deselect that lands before this show\u2019s cart has loaded is ignored, not silently undone', async () => {
    // The wizard restored `classSelections` from its own draft, so the chip
    // renders checked while the cart for this show is still loading. Mutating
    // now drops the selection locally with no cart row to delete -- and the
    // reconcile that runs the moment the cart lands puts the chip straight back
    // from the row the exhibitor just asked to remove. The deselect reads as
    // silently undone.
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const opts = makeHarness({ classSelections, isCartReady: false });
    await toggleClassSelection(opts);

    expect(opts.onSelectionChange).not.toHaveBeenCalled();
    expect(opts.removeItem).not.toHaveBeenCalled();
    expect(opts.addItem).not.toHaveBeenCalled();
    expect(opts.onBlockedByCart).toHaveBeenCalledTimes(1);
  });

  it('an add that lands before the cart has loaded is ignored too', async () => {
    const opts = makeHarness({ isCartReady: false });
    await toggleClassSelection(opts);

    expect(opts.addItem).not.toHaveBeenCalled();
    expect(opts.onSelectionChange).not.toHaveBeenCalled();
    expect(opts.notifyError).not.toHaveBeenCalled();
    expect(opts.onBlockedByCart).toHaveBeenCalledTimes(1);
  });

  it('the gate never blocks the non-cart (secretary) flow, which has no cart to wait for', async () => {
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const opts = makeHarness({ useCartFlow: false, isCartReady: false, classSelections });
    await toggleClassSelection(opts);

    expect(opts.onSelectionChange).toHaveBeenCalledWith([]);
    expect(opts.onBlockedByCart).not.toHaveBeenCalled();
  });

  it('once the cart is ready the same deselect goes through', async () => {
    const cartItems = [makeCartItem('d1', 'c1', 't1')];
    const classSelections: ClassSelectionData[] = [
      { dogId: 'd1', trialId: 't1', selectedClasses: [{ classId: 'c1' }] },
    ];
    const opts = makeHarness({ cartItems, classSelections, isCartReady: true });
    await toggleClassSelection(opts);

    expect(opts.removeItem).toHaveBeenCalledWith('item-d1-c1');
    expect(opts.onSelectionChange).toHaveBeenCalledWith([]);
    expect(opts.onBlockedByCart).not.toHaveBeenCalled();
  });
});
