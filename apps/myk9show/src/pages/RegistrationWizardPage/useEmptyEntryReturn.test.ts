import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useEmptyEntryReturn } from './useEmptyEntryReturn';

const STEPS = ['dog-selection', 'class-selection', 'payment', 'confirmation'];

function setup(initial: { currentStepId: string; entryCount: number }) {
  const setCurrentStep = vi.fn();
  const onEntryEmptied = vi.fn();
  const hook = renderHook(
    (props: { currentStepId: string; entryCount: number }) =>
      useEmptyEntryReturn({ ...props, stepIds: STEPS, setCurrentStep, onEntryEmptied }),
    { initialProps: initial }
  );
  return { ...hook, setCurrentStep, onEntryEmptied };
}

describe('useEmptyEntryReturn (MYK9-1289)', () => {
  it('sends the person to Classes when the last class goes away on Payment', () => {
    const { result, rerender, setCurrentStep } = setup({ currentStepId: 'payment', entryCount: 1 });
    rerender({ currentStepId: 'payment', entryCount: 0 });
    expect(setCurrentStep).toHaveBeenCalledWith(1);
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    expect(result.current).toBe(true);
  });

  it('tells the wizard the entry was emptied (it unticks the agreement) when it sends the person back', () => {
    const { rerender, setCurrentStep, onEntryEmptied } = setup({
      currentStepId: 'payment',
      entryCount: 1,
    });
    rerender({ currentStepId: 'payment', entryCount: 0 });
    expect(onEntryEmptied).toHaveBeenCalledTimes(1);
    expect(setCurrentStep).toHaveBeenCalledWith(1);
  });

  it('does not redirect a draft restore that mounts on Payment before selections arrive', () => {
    const { result, rerender, setCurrentStep } = setup({ currentStepId: 'payment', entryCount: 0 });
    rerender({ currentStepId: 'payment', entryCount: 2 });
    expect(setCurrentStep).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('does not redirect when classes are removed on a step other than Payment', () => {
    const { rerender, setCurrentStep } = setup({ currentStepId: 'class-selection', entryCount: 1 });
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    expect(setCurrentStep).not.toHaveBeenCalled();
  });

  it('clears the notice once a class is picked and does not re-announce on a later visit', () => {
    const { result, rerender } = setup({ currentStepId: 'payment', entryCount: 1 });
    rerender({ currentStepId: 'payment', entryCount: 0 });
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    expect(result.current).toBe(true);
    rerender({ currentStepId: 'class-selection', entryCount: 1 });
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    expect(result.current).toBe(false);
  });

  it('does not re-announce after leaving Classes and returning', () => {
    const { result, rerender } = setup({ currentStepId: 'payment', entryCount: 1 });
    rerender({ currentStepId: 'payment', entryCount: 0 });
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    rerender({ currentStepId: 'dog-selection', entryCount: 0 });
    rerender({ currentStepId: 'class-selection', entryCount: 0 });
    expect(result.current).toBe(false);
  });
});
