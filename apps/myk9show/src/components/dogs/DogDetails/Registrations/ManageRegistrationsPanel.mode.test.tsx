import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import ManageRegistrationsPanel from './ManageRegistrationsPanel';
import DogRegistrationDialogs from './DogRegistrationDialogs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * MYK9-1089: Add and Edit are a MODE of the Manage registrations panel, never a
 * second slide-out stacked on it. With Manage closed (the rail's Add, the
 * `?addRegistration=true` link, the secretary list) they still raise the
 * standalone panel, which is already a single slide-out.
 */
const mocks = vi.hoisted(() => ({
  createRegistration: vi.fn(),
  updateRegistration: vi.fn(),
  deleteRegistration: vi.fn(),
}));

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
    ],
    isLoading: false,
    error: null,
    createRegistration: mocks.createRegistration,
    updateRegistration: mocks.updateRegistration,
    deleteRegistration: mocks.deleteRegistration,
    refetch: vi.fn(),
  }),
}));

const dog = { id: 'dog-1', callName: 'Maple' } as unknown as Dog;

function Harness({
  initialOpen = true,
  autoOpenAddDialog = false,
  withEarlierPopover = false,
}: {
  initialOpen?: boolean;
  autoOpenAddDialog?: boolean;
  /** An unrelated page popover, opened and closed before Manage ever opens. */
  withEarlierPopover?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen && !withEarlierPopover);
  // Same sibling order as DogDetailsMain: Manage first, then the shared host.
  return (
    <>
      {withEarlierPopover && (
        <>
          <Popover>
            <PopoverTrigger>page-menu</PopoverTrigger>
            <PopoverContent>
              <button type="button">inside-pop</button>
            </PopoverContent>
          </Popover>
          <button type="button" onClick={() => setOpen(true)}>
            open-manage
          </button>
        </>
      )}
      <ManageRegistrationsPanel open={open} onClose={() => setOpen(false)} dog={dog} />
      <DogRegistrationDialogs
        dog={dog}
        managePanelOpen={open}
        autoOpenAddDialog={autoOpenAddDialog}
      />
    </>
  );
}

const slideOuts = () => document.querySelectorAll('[role="dialog"]');
const editButton = () => screen.getByRole('button', { name: /edit akc registered name/i });

beforeEach(() => {
  mocks.createRegistration.mockReset();
  mocks.updateRegistration.mockReset();
  mocks.createRegistration.mockImplementation((_data, opts) => opts?.onSuccess?.());
  mocks.updateRegistration.mockImplementation((_vars, opts) => opts?.onSuccess?.());
});

afterEach(() => {
  act(() => {
    useRegistrationsStore.setState({
      isAddRegistrationDialogOpen: false,
      isEditRegistrationDialogOpen: false,
      isDeleteRegistrationDialogOpen: false,
      selectedRegistration: null,
    });
  });
});

describe('ManageRegistrationsPanel — Add and Edit are modes of the one panel', () => {
  it('Add renders inside the Manage panel and leaves exactly one slide-out on screen', async () => {
    const { user } = render(<Harness />);
    expect(slideOuts()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByLabelText(/registered name/i)).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
    expect(within(slideOuts()[0] as HTMLElement).getByLabelText(/registered name/i)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Add Registration' })).toBeInTheDocument();
    expect(screen.queryByText('CH Test Dog')).not.toBeInTheDocument();
  });

  it('Edit renders inside the Manage panel and leaves exactly one slide-out on screen', async () => {
    const { user } = render(<Harness />);

    await user.click(editButton());

    expect(await screen.findByDisplayValue('CH Test Dog')).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Edit Registration' })).toBeInTheDocument();
  });

  it('Back returns to the list and puts focus on the Add button that opened the mode', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await screen.findByLabelText(/registered name/i);

    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(await screen.findByText('CH Test Dog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^add$/i })).toHaveFocus();
  });

  it('Back from Edit puts focus on that row’s Edit control', async () => {
    const { user } = render(<Harness />);
    await user.click(editButton());
    await screen.findByDisplayValue('CH Test Dog');

    await user.click(screen.getByRole('button', { name: /back/i }));

    await screen.findByText('CH Test Dog');
    expect(editButton()).toHaveFocus();
  });

  it('Escape leaves the mode first; a second Escape closes the panel', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await screen.findByLabelText(/registered name/i);

    await user.keyboard('{Escape}');
    expect(await screen.findByText('CH Test Dog')).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(slideOuts()).toHaveLength(0));
  });

  it.each([
    [
      'Back',
      async (user: ReturnType<typeof render>['user']) =>
        user.click(screen.getByRole('button', { name: /back/i })),
    ],
    ['Escape', async (user: ReturnType<typeof render>['user']) => user.keyboard('{Escape}')],
  ])('a dirty form asks before %s discards it', async (_label, leave) => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(await screen.findByLabelText(/registered name/i), 'CH New');

    await leave(user);

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    // Still in the form until the user confirms.
    expect(screen.getByLabelText(/registered name/i)).toHaveValue('CH New');

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('CH Test Dog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
  });

  it('saving an Add sends the same payload as before and returns to the list', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.selectOptions(
      await screen.findByLabelText(/^organization/i),
      'AKC (American Kennel Club)'
    );
    await user.type(screen.getByLabelText(/registered name/i), 'CH New Dog');
    await user.selectOptions(screen.getByLabelText(/^breed/i), 'Beagle');
    await user.type(screen.getByLabelText(/registration number/i), 'SR999');

    await user.click(screen.getByRole('button', { name: 'Add Registration' }));

    await waitFor(() =>
      expect(mocks.createRegistration).toHaveBeenCalledWith(
        {
          organization: 'AKC (American Kennel Club)',
          registered_name: 'CH New Dog',
          breed: 'Beagle',
          variety: null,
          registration_number: 'SR999',
          status: 'Active',
          registration_date: null,
        },
        expect.any(Object)
      )
    );
    expect(await screen.findByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
  });

  it('saving an Edit sends the same payload as before and returns to the list', async () => {
    const { user } = render(<Harness />);
    await user.click(editButton());
    await user.type(await screen.findByDisplayValue('CH Test Dog'), ' II');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(mocks.updateRegistration).toHaveBeenCalledWith(
        {
          id: 'registration-1',
          updates: {
            organization: 'AKC',
            registered_name: 'CH Test Dog II',
            breed: 'Beagle',
            variety: null,
            registration_number: 'SR12345',
            status: 'Active',
            registration_date: null,
          },
        },
        expect.any(Object)
      )
    );
    expect(await screen.findByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
  });

  it('a rejected save keeps the form and its edits', async () => {
    mocks.updateRegistration.mockImplementation((_vars, opts) =>
      opts?.onError?.(new Error('boom'))
    );
    const { user } = render(<Harness />);
    await user.click(editButton());
    await user.type(await screen.findByDisplayValue('CH Test Dog'), ' II');

    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.updateRegistration).toHaveBeenCalled());
    expect(await screen.findByDisplayValue('CH Test Dog II')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Registration' })).toBeInTheDocument();
  });
});

describe('focus stays inside the Manage panel', () => {
  it('Add moves focus to the first field; Edit moves it to the form’s first control', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(screen.getByLabelText(/^organization/i)).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /back/i }));
    await screen.findByText('CH Test Dog');

    await user.click(editButton());
    await screen.findByDisplayValue('CH Test Dog');
    await waitFor(() => {
      const active = document.activeElement as HTMLElement;
      expect(active.id).toBe('organization');
      expect(slideOuts()[0]).toContainElement(active);
    });
  });

  it('after a successful Add save focus lands on the header Add button', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.selectOptions(
      await screen.findByLabelText(/^organization/i),
      'AKC (American Kennel Club)'
    );
    await user.type(screen.getByLabelText(/registered name/i), 'CH New Dog');
    await user.selectOptions(screen.getByLabelText(/^breed/i), 'Beagle');
    await user.type(screen.getByLabelText(/registration number/i), 'SR999');
    await user.click(screen.getByRole('button', { name: 'Add Registration' }));

    await screen.findByRole('heading', { name: 'Registrations' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^add$/i })).toHaveFocus());
  });

  it('after a successful Edit save focus lands on that row’s Edit control', async () => {
    const { user } = render(<Harness />);
    await user.click(editButton());
    await user.type(await screen.findByDisplayValue('CH Test Dog'), ' II');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await screen.findByRole('heading', { name: 'Registrations' });
    await waitFor(() => expect(editButton()).toHaveFocus());
  });

  it('after Discard focus stays in the panel even when an earlier popup was used', async () => {
    const { user } = render(<Harness withEarlierPopover />);
    // An unrelated popup opens and closes first, so Base UI's global focus
    // history holds its trigger: the stale target a discarded form must not reach.
    await user.click(screen.getByRole('button', { name: 'page-menu' }));
    await screen.findByRole('button', { name: 'inside-pop' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'inside-pop' })).toBeNull());

    await user.click(screen.getByRole('button', { name: 'open-manage' }));
    await user.click(await screen.findByRole('button', { name: /^add$/i }));
    await user.type(await screen.findByLabelText(/registered name/i), 'X');
    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await screen.findByText('CH Test Dog');

    // Base UI returns focus in a microtask after the prompt unmounts; let it run.
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
    });
    expect(screen.getByRole('button', { name: /^add$/i })).toHaveFocus();
  });

  it('Escape on the discard prompt answers the prompt and does not re-raise it', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.type(await screen.findByLabelText(/registered name/i), 'X');
    await user.keyboard('{Escape}');
    await screen.findByText('Discard changes?');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText('Discard changes?')).toBeNull());
    expect(screen.getByLabelText(/registered name/i)).toHaveValue('X');
  });
});

describe('Delete from inside the Manage panel', () => {
  it('confirms in a dialog, deletes that row, and the panel stays on the list', async () => {
    const { user } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));

    const confirm = await screen.findByRole('button', { name: 'Delete' });
    await user.click(confirm);

    await waitFor(() =>
      expect(mocks.deleteRegistration).toHaveBeenCalledWith('registration-1', expect.any(Object))
    );
    await waitFor(() => expect(slideOuts()).toHaveLength(1));
    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
  });
});

describe('standalone Add with the Manage panel closed', () => {
  it('the rail / deep-link request opens the one standalone Add panel', async () => {
    render(<Harness initialOpen={false} autoOpenAddDialog />);

    expect(await screen.findByRole('heading', { name: 'Add Registration' })).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Registrations' })).not.toBeInTheDocument();
  });

  it('a secretary-style Edit with Manage closed opens the standalone Edit panel', async () => {
    render(<Harness initialOpen={false} />);
    act(() => {
      useRegistrationsStore.setState({
        selectedRegistration: {
          id: 'registration-1',
          organization: 'AKC',
          registeredName: 'CH Test Dog',
          registrationNumber: 'SR12345',
          breed: 'Beagle',
        } as never,
        isEditRegistrationDialogOpen: true,
      });
    });

    expect(await screen.findByRole('heading', { name: 'Edit Registration' })).toBeInTheDocument();
    expect(slideOuts()).toHaveLength(1);
  });
});
