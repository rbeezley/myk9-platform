import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import RegistrationsSection from './RegistrationsSection';
import DogRegistrationDialogs from './DogRegistrationDialogs';

const mocks = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  registrations: vi.fn(),
}));

vi.mock('@/hooks/queries/useRegistrationsDatabase', () => ({
  useDogRegistrationManagement: () => ({
    registrations: mocks.registrations() ?? [
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
    createRegistration: mocks.createRegistration,
    updateRegistration: vi.fn(),
    deleteRegistration: vi.fn(),
    refetch: vi.fn(),
  }),
}));
let capturedOnSave: ((data: Record<string, string>) => Promise<void>) | undefined;
vi.mock('./AddRegistrationPanel', () => ({
  default: ({ open, onSave }: { open: boolean; onSave: (d: never) => Promise<void> }) => {
    capturedOnSave = onSave as unknown as (data: Record<string, string>) => Promise<void>;
    return open ? <div role="dialog">Add registration</div> : null;
  },
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
// NOT mocked: the delete confirmation names the registration, and the store can
// hold the raw snake_case PostgREST row.

afterEach(() => {
  mocks.registrations.mockReset();
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

  // The store carries whatever the caller selected — the mapped domain object in
  // some paths, the raw `dog_registrations` row in others. Reading only
  // `registeredName` rendered `delete ""`, on the exhibitor's only delete path.
  it('names the registration in the delete confirmation on the raw row shape', () => {
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    render(<DogRegistrationDialogs dog={dog} />);

    act(() => {
      useRegistrationsStore.getState().setSelectedRegistration({
        id: 'registration-1',
        organization: 'AKC',
        registered_name: 'CH Test Dog',
      } as never);
      useRegistrationsStore.getState().setIsDeleteRegistrationDialogOpen(true);
    });

    expect(screen.getByText(/CH Test Dog/)).toBeInTheDocument();
  });

  // EditPanelWrapper keeps the panel open when onSave rejects, so a rejected
  // insert has to reject — swallowing it closed the panel and, because the panel
  // is keyed to remount blank, threw away everything the user typed.
  it('rejects a failed add so the panel keeps what was typed', async () => {
    mocks.createRegistration.mockImplementation((_data, opts) =>
      opts.onError(new Error('duplicate key value violates unique constraint'))
    );
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    render(<DogRegistrationDialogs dog={dog} />);

    act(() => {
      useRegistrationsStore.getState().setIsAddRegistrationDialogOpen(true);
    });

    await expect(
      capturedOnSave!({
        organization: 'AKC',
        registeredName: 'CH Test Dog',
        breed: 'Beagle',
        variety: '',
        registrationNumber: 'SR1',
        status: 'Active',
        registrationDate: '',
      })
    ).rejects.toThrow();
    expect(useRegistrationsStore.getState().isAddRegistrationDialogOpen).toBe(true);
  });

  // The secretary sees this list inline beside the identity rail, which has its
  // own "Add registration". A second one here is both a duplicate control and a
  // Playwright strict-mode failure in dogsUI.spec.ts.
  it('adds no second Add control to the empty state', () => {
    mocks.registrations.mockReturnValue([]);
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    render(<RegistrationsSection dog={dog} />);

    expect(screen.getByText('No Registrations Found')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add registration$/i })).toBeNull();
  });

  // The open request must not re-assert itself on every parent render: the
  // caller's `onAddRequestConsumed` is an inline closure, so an unlatched effect
  // re-opens the panel the user just closed.
  it('opens the add panel once, not on every render', () => {
    const dog = { id: 'dog-1', callName: 'Test Dog' } as Dog;
    // A FRESH inline closure per render, which is what the real call site
    // passes. With a stable (or omitted) callback the effect deps never change
    // and the effect never re-runs, so a test that does that cannot fail.
    const { rerender } = render(
      <DogRegistrationDialogs dog={dog} autoOpenAddDialog onAddRequestConsumed={() => {}} />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      useRegistrationsStore.getState().setIsAddRegistrationDialogOpen(false);
    });
    rerender(
      <DogRegistrationDialogs dog={dog} autoOpenAddDialog onAddRequestConsumed={() => {}} />
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
