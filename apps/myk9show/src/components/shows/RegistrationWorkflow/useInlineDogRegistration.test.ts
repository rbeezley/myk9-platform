import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registration } from '@/types/dog-types';

const { mutateAsync, toastSuccess, toastError } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useCreateRegistrationMutation: () => ({ mutateAsync }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('@/hooks/translateDogDbError', () => ({
  translateDogDbError: (error: Error) => ({ message: error.message }),
}));

import { toDogRegistrationInsert, useInlineDogRegistration } from './useInlineDogRegistration';

describe('toDogRegistrationInsert', () => {
  it('keeps every organization-scoped registration field in the canonical mutation payload', () => {
    const registration: Registration = {
      id: 'local-registration',
      organization: 'UKC',
      registeredName: 'Official Name',
      registrationNumber: 'UKC-123',
      breed: 'Beagle',
      variety: '13 inch',
      status: 'Active',
      applicationNumber: 'APP-1',
      submissionDate: '2026-08-20',
      registrationDate: '2026-08-21',
      certificate: 'certificate.pdf',
    };

    expect(toDogRegistrationInsert('dog-1', registration)).toEqual({
      dog_id: 'dog-1',
      organization: 'UKC',
      registered_name: 'Official Name',
      registration_number: 'UKC-123',
      breed: 'Beagle',
      variety: '13 inch',
      status: 'Active',
      application_number: 'APP-1',
      submission_date: '2026-08-20',
      registration_date: '2026-08-21',
      certificate: 'certificate.pdf',
    });
  });
});

describe('useInlineDogRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the registration editor targeted at the dog when saving fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('Registration could not be saved.'));
    const onSaved = vi.fn();
    const { result } = renderHook(() => useInlineDogRegistration(onSaved));

    act(() => result.current.openRegistrationEditor('dog-1'));

    let saveResult: boolean | undefined;
    await act(async () => {
      saveResult = await result.current.saveRegistration({
        id: 'registration-1',
        organization: 'AKC',
        registeredName: 'Official Name',
        registrationNumber: 'SR123',
        breed: 'Beagle',
        status: 'Active',
      });
    });

    expect(saveResult).toBe(false);
    expect(result.current.registrationDogId).toBe('dog-1');
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('Registration could not be saved.');
  });
});
