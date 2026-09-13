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
    setStepCompletionState: vi.fn(() => calls.push('setStepCompletionState')),
    setCurrentStep: vi.fn(() => calls.push('setCurrentStep')),
    ...overrides,
  };
  return { ...base, calls };
}

describe('startOverAtClassSelection', () => {
  it('resets selections, completion and the step BEFORE the cart is even touched', () => {
    const d = deps();
    startOverAtClassSelection(d);

    // The whole reset is synchronous and lands first. Any await between the
    // reset and the step move leaves Payment active, completed, and submittable
    // over an entry whose classes were just cleared.
    expect(d.calls).toEqual([
      'setClassSelections',
      'setStepCompletionState',
      'setCurrentStep',
      'abandonCart',
    ]);
    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.setStepCompletionState).toHaveBeenCalledWith({});
    expect(d.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('leaves no async window: a cart release that never settles blocks nothing', () => {
    // If the implementation ever awaits again, this pins the regression: the
    // reset must already be done by the time the call returns.
    const d = deps({ abandonCart: vi.fn(() => new Promise<boolean>(() => {})) });

    const result = startOverAtClassSelection(d);

    expect(result).toBeUndefined();
    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.setStepCompletionState).toHaveBeenCalledWith({});
    expect(d.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('clears payment completion, not just the class step', () => {
    // A whole-map reset, not a targeted delete: the rail guard reads
    // completion to decide which steps can be returned to, so leaving
    // `payment: true` behind lets the exhibitor walk straight back to Submit.
    const d = deps();
    startOverAtClassSelection(d);
    expect(d.setStepCompletionState).toHaveBeenCalledWith({});
  });

  it('still resets when there is no cart to release', () => {
    const d = deps({ cartBelongsToThisRegistration: false });
    startOverAtClassSelection(d);

    expect(d.abandonCart).not.toHaveBeenCalled();
    expect(d.calls).toEqual(['setClassSelections', 'setStepCompletionState', 'setCurrentStep']);
  });

  it('never abandons a cart that belongs to another show or exhibitor', () => {
    const d = deps({ cartBelongsToThisRegistration: false });
    startOverAtClassSelection(d);

    expect(d.abandonCart).not.toHaveBeenCalled();
    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('survives a cart release that rejects, without unhandled rejection', () => {
    const d = deps({ abandonCart: vi.fn(() => Promise.reject(new Error('network'))) });
    expect(() => startOverAtClassSelection(d)).not.toThrow();

    expect(d.setClassSelections).toHaveBeenCalledWith([]);
    expect(d.setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('does nothing when the workflow has no class-selection step', () => {
    const d = deps({ classStepIndex: -1 });
    startOverAtClassSelection(d);

    expect(d.setClassSelections).not.toHaveBeenCalled();
    expect(d.setStepCompletionState).not.toHaveBeenCalled();
    expect(d.setCurrentStep).not.toHaveBeenCalled();
    expect(d.abandonCart).not.toHaveBeenCalled();
  });
});
