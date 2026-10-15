/**
 * MYK9-1162: the "Registration number needed" pane completes a registration that
 * exists with a blank number by asking this host to open Edit on it.
 */
import { describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useRegistrationsStore } from '@/store/registrationsStore';
import type { Dog, Registration } from '@/types/dog-types';

vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useDogRegistrationManagement: () => ({
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
  }),
}));
vi.mock('./AddRegistrationPanel', () => ({ default: () => null }));
vi.mock('./EditRegistrationPanel', () => ({
  default: ({ open, registration }: { open: boolean; registration: Registration | null }) =>
    open ? <output data-testid="edit-panel">{registration?.id}</output> : null,
}));
vi.mock('./ConfirmDeleteRegistrationDialog', () => ({ default: () => null }));

import DogRegistrationDialogs from './DogRegistrationDialogs';

const dog = { id: 'dog-1', callName: 'Biscuit' } as Dog;
const blank = { id: 'reg-akc-blank', organization: 'AKC', registrationNumber: '' } as Registration;

describe('DogRegistrationDialogs edit request', () => {
  it('opens Edit on the requested registration, once, and reports it consumed', async () => {
    const consumed = vi.fn();
    const { findByTestId, rerender } = render(
      <DogRegistrationDialogs
        dog={dog}
        autoOpenEditRegistration={blank}
        onEditRequestConsumed={consumed}
      />
    );

    expect(await findByTestId('edit-panel')).toHaveTextContent('reg-akc-blank');
    expect(useRegistrationsStore.getState().isAddRegistrationDialogOpen).toBe(false);
    expect(consumed).toHaveBeenCalledTimes(1);

    rerender(
      <DogRegistrationDialogs
        dog={dog}
        autoOpenEditRegistration={blank}
        onEditRequestConsumed={consumed}
      />
    );
    await waitFor(() => expect(consumed).toHaveBeenCalledTimes(1));
  });
});
