import { describe, expect, it, vi } from 'vitest';
import { startOverAtClassSelection } from './startOver';

function deps(overrides: Partial<Parameters<typeof startOverAtClassSelection>[0]> = {}) {
  const calls: string[] = [];
  const base = {
    hasCart: true,
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
    const d = deps({ hasCart: false });
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
});
