import { describe, expect, it, vi } from 'vitest';
import { startOverAtClassSelection } from './startOver';

function deps(overrides: Partial<Parameters<typeof startOverAtClassSelection>[0]> = {}) {
  const calls: string[] = [];
  const base = {
    cartBelongsToThisRegistration: true,
    classStepIndex: 1,
    abandonCart: vi.fn(async () => {
      calls.push('abandonCart');
      return true;
    }),
    setClassSelections: vi.fn(() => calls.push('setClassSelections')),
    goToStep: vi.fn(() => calls.push('goToStep')),
    ...overrides,
  };
  return { ...base, calls };
}

describe('startOverAtClassSelection', () => {
  it('drops the wizard selections and releases the expired cart BEFORE navigating', async () => {
    const d = deps();
    await startOverAtClassSelection(d);

    // Order is the whole point: navigating first lands the exhibitor on the
    // class step while the stale selections are still there, and a selection
    // with no cart row is treated as an add — duplicate entries.
    expect(d.calls).toEqual(['setClassSelections', 'abandonCart', 'goToStep']);
    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.goToStep).toHaveBeenCalledWith(1);
  });

  it('still navigates when there is no cart to release', async () => {
    const d = deps({ cartBelongsToThisRegistration: false });
    await startOverAtClassSelection(d);

    expect(d.abandonCart).not.toHaveBeenCalled();
    expect(d.calls).toEqual(['setClassSelections', 'goToStep']);
  });

  it('navigates even if releasing the cart fails, so the exhibitor is never stuck', async () => {
    const d = deps({
      abandonCart: vi.fn(async () => {
        throw new Error('network');
      }),
    });
    await startOverAtClassSelection(d);

    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.goToStep).toHaveBeenCalledWith(1);
  });

  it('does nothing when the workflow has no class-selection step', async () => {
    const d = deps({ classStepIndex: -1 });
    await startOverAtClassSelection(d);

    expect(d.setClassSelections).not.toHaveBeenCalled();
    expect(d.abandonCart).not.toHaveBeenCalled();
    expect(d.goToStep).not.toHaveBeenCalled();
  });
  // The cart store is a singleton: on a wizard opened before this show's cart
  // has loaded it may still hold a PREVIOUS show's expired cart. Abandoning
  // that one would throw away a cart this wizard never owned (Codex #2210 P1).
  it('never abandons a cart that belongs to another show or exhibitor', async () => {
    const d = deps({ cartBelongsToThisRegistration: false });
    await startOverAtClassSelection(d);

    expect(d.abandonCart).not.toHaveBeenCalled();
    // The exhibitor still gets back to the class step with a clean slate.
    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.goToStep).toHaveBeenCalledWith(1);
  });
});
