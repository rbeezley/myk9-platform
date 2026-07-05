import { describe, it, expect, vi } from 'vitest';
import { buildDogSavedToast } from '../dogSavedToast';
import type { Dog as DogType } from '@/types/dog-types';

const dog = { id: 'dog-1', callName: 'Buddy' } as DogType;

describe('buildDogSavedToast (4.E — durable dog-saved confirmation)', () => {
  it('confirms the save by name', () => {
    const toast = buildDogSavedToast('Buddy', dog);
    expect(toast.message).toBe('Buddy added');
    expect(toast.options).toBeUndefined();
  });

  it('falls back to "Dog" when the call name is blank or whitespace', () => {
    expect(buildDogSavedToast('', dog).message).toBe('Dog added');
    expect(buildDogSavedToast('   ', dog).message).toBe('Dog added');
    expect(buildDogSavedToast(undefined, dog).message).toBe('Dog added');
  });

  it('trims the call name', () => {
    expect(buildDogSavedToast('  Rex  ', dog).message).toBe('Rex added');
  });

  it('adds an "Enter a show" action only when a handler is provided', () => {
    const onEnter = vi.fn();
    const toast = buildDogSavedToast('Buddy', dog, onEnter);
    expect(toast.options?.action?.label).toBe('Enter a show');

    toast.options?.action?.onClick();
    expect(onEnter).toHaveBeenCalledWith(dog);
  });

  it('omits the action when no handler is provided (e.g. mid-registration)', () => {
    expect(buildDogSavedToast('Buddy', dog).options).toBeUndefined();
  });
});
