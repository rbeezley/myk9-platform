import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registration } from '@/types/dog-types';

const { addRegistration, toastSuccess, toastError } = vi.hoisted(() => ({
  addRegistration: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useQueuedRegistrationWrites', () => ({
  useQueuedRegistrationWrites: () => ({ addRegistration }),
}));
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }));
vi.mock('@/hooks/translateDogDbError', () => ({
  dogSaveMessage: (error: Error) => error.message,
}));

import { toRegistrationAddFields, useInlineDogRegistration } from './useInlineDogRegistration';

describe('toRegistrationAddFields', () => {
  it('keeps every organization-scoped registration field in the queued insert (MYK9-1071)', () => {
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

    expect(toRegistrationAddFields(registration)).toEqual({
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
    });
  });
});

describe('useInlineDogRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the registration editor targeted at the dog when saving fails', async () => {
    addRegistration.mockRejectedValueOnce(new Error('Registration could not be saved.'));
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
