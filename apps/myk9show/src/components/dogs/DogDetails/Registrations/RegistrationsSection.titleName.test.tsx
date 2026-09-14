import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import RegistrationsSection from './RegistrationsSection';
import DogRegistrationDialogs from './DogRegistrationDialogs';

vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useDogRegistrationManagement: () => ({
    registrations: [
      {
        id: 'registration-1',
        organization: 'AKC',
        registeredName: 'CH Test Dog',
        registrationNumber: 'SR12345',
        breed: 'Beagle',
      },
      {
        id: 'registration-2',
        organization: 'UKC',
        registeredName: 'UCH Test Dog',
        registrationNumber: 'R67890',
        breed: 'Beagle',
      },
    ],
    isLoading: false,
    error: null,
    createRegistration: vi.fn(),
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('./AddRegistrationPanel', () => ({
  default: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Add registration</div> : null,
}));
vi.mock('./EditRegistrationPanel', () => ({
  default: ({
    open,
    registration,
  }: {
    open: boolean;
    registration: { organization?: string; registeredName?: string } | null;
  }) =>
    open ? (
      <div role="dialog">
        Editing {registration?.organization}: {registration?.registeredName}
      </div>
    ) : null,
}));
vi.mock('./ConfirmDeleteRegistrationDialog', () => ({ default: () => null }));

afterEach(() => {
  useRegistrationsStore.getState().setIsAddRegistrationDialogOpen(false);
  useRegistrationsStore.getState().setIsEditRegistrationDialogOpen(false);
  useRegistrationsStore.getState().setSelectedRegistration(null);
});

describe('registration name editing', () => {
  // The panels no longer depend on the list: the rail's Add and the
  // `?addRegistration=true` link work on a page that shows no registrations at
  // all, which is the whole point of hosting them separately (MYK9-518).
  it('opens the add panel with no registrations list mounted', () => {
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    render(<DogRegistrationDialogs dog={dog} autoOpenAddDialog />);
    expect(screen.getByRole('dialog')).toHaveTextContent('Add registration');
    expect(screen.queryByText('CH Test Dog')).not.toBeInTheDocument();
  });

  it('opens the selected organization’s registration from its visible name action', async () => {
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    const { user } = render(
      <>
        <DogRegistrationDialogs dog={dog} />
        <RegistrationsSection dog={dog} />
      </>
    );

    expect(screen.getByText('CH Test Dog')).toBeInTheDocument();
    expect(screen.getByText('UCH Test Dog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Edit UKC registered name for UCH Test Dog' })
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Editing UKC: UCH Test Dog');
  });

  // registrationsStore is module-global and DogRegistrationDialogs is mounted on
  // every dog page. Left un-reset, Back-ing out of an open Edit on dog A and
  // opening dog B re-opens that panel holding A's registration under B's name —
  // and saving writes to A's row.
  it('clears panel state when the dog changes', () => {
    const dogA = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    const dogB = { id: 'dog-2', callName: 'Other Dog' } as Dog;
    const { rerender } = render(<DogRegistrationDialogs dog={dogA} />);

    act(() => {
      useRegistrationsStore
        .getState()
        .setSelectedRegistration({ id: 'registration-1', organization: 'AKC' } as never);
      useRegistrationsStore.getState().setIsEditRegistrationDialogOpen(true);
    });
    expect(screen.getByRole('dialog')).toHaveTextContent('Editing AKC');

    rerender(<DogRegistrationDialogs dog={dogB} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useRegistrationsStore.getState().selectedRegistration).toBeNull();
  });
});
