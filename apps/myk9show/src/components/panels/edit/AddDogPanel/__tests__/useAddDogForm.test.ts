import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Registration } from '@/types/dog-types';
import type { FormValidation } from '@/hooks/useFormValidation';
import { useAddDogForm } from '../useAddDogForm';
import { createInitialFormData } from '../types';
import type { DogFormData } from '../types';

/**
 * 6.3: the Add-a-Dog wizard's dog isn't persisted yet, so adding/editing a
 * registration must write to wizard state via `form.setValue('registrations', …)`
 * — never a DB call — regardless of whether the registration form is hosted in
 * a modal dialog or (post-D6) a `SlideOverPanel`. This exercises the handler
 * `useAddDogForm` gives to whichever shell hosts the form.
 */
const makeMockForm = (data: DogFormData): FormValidation<DogFormData> => ({
  data,
  errors: {},
  setValue: vi.fn(),
  setValues: vi.fn(),
  getError: vi.fn().mockReturnValue(undefined),
  getFieldProps: vi
    .fn()
    .mockReturnValue({ 'aria-invalid': false, 'aria-describedby': undefined, ref: vi.fn() }),
  touchField: vi.fn(),
  handleSubmit: vi.fn(),
  isSubmitting: false,
  isValid: true,
  reset: vi.fn(),
  hasChanges: false,
});

const registration = (overrides: Partial<Registration> = {}): Registration => ({
  id: 'reg-1',
  organization: 'AKC (American Kennel Club)',
  registeredName: 'Ch Test Dog',
  breed: 'Labrador Retriever',
  registrationNumber: 'SR12345',
  status: 'Active',
  ...overrides,
});

describe('useAddDogForm registration handling (wizard state, not DB)', () => {
  it('openAddRegistration + handleSaveRegistration lands the new registration in wizard state', () => {
    const form = makeMockForm(createInitialFormData());
    const { result } = renderHook(() => useAddDogForm({ open: true, form }));

    act(() => {
      result.current.openAddRegistration();
    });
    expect(result.current.isAddEditRegDialogOpen).toBe(true);
    expect(result.current.currentRegToEdit).toBeUndefined();

    const newReg = registration();
    act(() => {
      result.current.handleSaveRegistration(newReg);
    });

    expect(form.setValue).toHaveBeenCalledWith('registrations', [newReg]);
    // Closes the slide-over/dialog after a successful save (save/cancel
    // semantics unchanged by the D6 shell swap).
    expect(result.current.isAddEditRegDialogOpen).toBe(false);
    expect(result.current.currentRegToEdit).toBeUndefined();
  });

  it('openEditRegistration + handleSaveRegistration replaces the matching registration in wizard state', () => {
    const existing = registration();
    const data = { ...createInitialFormData(), registrations: [existing] };
    const form = makeMockForm(data);
    const { result } = renderHook(() => useAddDogForm({ open: true, form }));

    act(() => {
      result.current.openEditRegistration(existing);
    });
    expect(result.current.currentRegToEdit).toEqual(existing);

    const updated = registration({ registeredName: 'Ch Test Dog Updated' });
    act(() => {
      result.current.handleSaveRegistration(updated);
    });

    expect(form.setValue).toHaveBeenCalledWith('registrations', [updated]);
  });
});
