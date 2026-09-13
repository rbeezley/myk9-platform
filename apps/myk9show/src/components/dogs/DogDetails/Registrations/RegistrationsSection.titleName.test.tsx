import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import RegistrationsSection from './RegistrationsSection';

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
vi.mock('./AddRegistrationPanel', () => ({ default: () => null }));
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
  useRegistrationsStore.getState().setIsEditRegistrationDialogOpen(false);
  useRegistrationsStore.getState().setSelectedRegistration(null);
});

describe('registration name editing', () => {
  it('opens the selected organization’s registration from its visible name action', async () => {
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    const { user } = render(<RegistrationsSection dog={dog} />);

    expect(screen.getByText('CH Test Dog')).toBeInTheDocument();
    expect(screen.getByText('UCH Test Dog')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Edit UKC registered name for UCH Test Dog' })
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Editing UKC: UCH Test Dog');
  });
});
