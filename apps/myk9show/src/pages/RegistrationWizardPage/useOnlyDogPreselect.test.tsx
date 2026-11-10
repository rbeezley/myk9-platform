/**
 * MYK9-1795 — when the only-dog tick applies, and that it applies once.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Dog } from '@/types/dog-types';
import { useOnlyDogPreselect, type OnlyDogPreselectOptions } from './useOnlyDogPreselect';

const makeDog = (overrides: Partial<Dog> = {}) =>
  ({
    id: 'dog-1',
    name: 'Maple',
    callName: 'Maple',
    breed: 'Border Collie',
    sex: 'female',
    ownerId: 'owner-1',
    status: 'active',
    ...overrides,
  }) as Dog;

function render(overrides: Partial<OnlyDogPreselectOptions> = {}, route = '/shows/s1/register') {
  const handleDogSelectionChange = vi.fn();
  const markAutoTick = vi.fn();
  const props: OnlyDogPreselectOptions = {
    dogs: [makeDog()],
    dogsReady: true,
    registrationData: { selectedDogs: [] },
    currentWorkflowMode: 'exhibitor',
    rehydrationSettled: true,
    currentWorkflowConfig: { steps: ['dog-selection', 'class-selection'] },
    entryCloseAvailability: { canEnter: true },
    availableDrafts: [],
    handleDogSelectionChange,
    markAutoTick,
    ...overrides,
  };
  const result = renderHook((next: OnlyDogPreselectOptions) => useOnlyDogPreselect(next), {
    initialProps: props,
    wrapper: ({ children }) => <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>,
  });
  return { ...result, props, handleDogSelectionChange, markAutoTick };
}

describe('useOnlyDogPreselect', () => {
  it('ticks the only dog and marks it automatic', () => {
    const { handleDogSelectionChange, markAutoTick } = render();
    expect(handleDogSelectionChange).toHaveBeenCalledWith(['dog-1']);
    expect(markAutoTick).toHaveBeenCalledWith('dog-1');
  });

  it.each([
    ['several dogs', { dogs: [makeDog(), makeDog({ id: 'dog-2' })] }],
    ['a deleted dog beside the only one makes it the only tickable dog', null],
    [
      'a too-young only dog',
      { dogs: [makeDog({ dateOfBirth: new Date().toISOString() } as Partial<Dog>)] },
    ],
    ['a saved entry waiting', { availableDrafts: [{ selectedDogsCount: 1, completed: false }] }],
    ['a non-exhibitor mode', { currentWorkflowMode: 'secretary' }],
    ['a workflow without the dog step', { currentWorkflowConfig: { steps: ['class-selection'] } }],
  ] as const)('does nothing for %s unless it is the only tickable dog', (_label, overrides) => {
    if (overrides === null) {
      const { handleDogSelectionChange } = render({
        dogs: [makeDog(), makeDog({ id: 'dog-2', deletedAt: '2026-01-01' } as Partial<Dog>)],
      });
      expect(handleDogSelectionChange).toHaveBeenCalledWith(['dog-1']);
      return;
    }
    const { handleDogSelectionChange } = render(overrides as Partial<OnlyDogPreselectOptions>);
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
  });

  it('does nothing with a ?dogId= link', () => {
    const { handleDogSelectionChange } = render({}, '/shows/s1/register?dogId=dog-1');
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
  });

  it('waits for the roster and the restore to settle', () => {
    const { handleDogSelectionChange, rerender, props } = render({
      dogsReady: false,
      rehydrationSettled: false,
    });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    rerender({ ...props, dogsReady: true, rehydrationSettled: false });
    expect(handleDogSelectionChange).not.toHaveBeenCalled();
    rerender({ ...props, dogsReady: true, rehydrationSettled: true });
    expect(handleDogSelectionChange).toHaveBeenCalledTimes(1);
  });

  it('never re-applies after she unticks', () => {
    const { handleDogSelectionChange, rerender, props } = render();
    rerender({ ...props, registrationData: { selectedDogs: ['dog-1'] } });
    rerender({ ...props, registrationData: { selectedDogs: [] } });
    expect(handleDogSelectionChange).toHaveBeenCalledTimes(1);
  });
});
