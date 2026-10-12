/**
 * MYK9-1112: the Edit buttons in Quick Create must edit the SAVED record in
 * place (same id, same selection), never re-run a blank create form. The real
 * QuickCreateFlow, Person form and Dog edit panel render; only persistence is
 * faked, so an `updateDog` / `updateUser` call carries the id it was aimed at.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { useUserStore } from '@/store/userStore';
import { QuickCreateFlow } from '../QuickCreateFlow';
import {
  quickCreateMocks as mocks,
  resetQuickCreateMocks,
} from '@/test/quickCreate/quickCreateFlowMocks';
import {
  addPersonThroughForm,
  fillDogBasics,
  JOURNEY_TIMEOUT_MS,
} from '@/test/quickCreate/quickCreateFlowKit';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/hooks/usePeopleQuery', () => ({
  usePeopleQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  ...(await import('@/test/quickCreate/quickCreateFlowMocks')).usersModule,
}));
vi.mock(
  '@/services/replication/ReplicatedShowDeskPeopleTable',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).showDeskPeopleModule
);
vi.mock(
  '@/hooks/useDogStoreCompat',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).dogStoreModule
);
vi.mock(
  '../CreatedInSessionContext',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).createdInSessionModule
);
vi.mock(
  '@/components/ui/popover',
  async () => (await import('@/test/quickCreate/quickCreateFlowMocks')).popoverModule
);

beforeEach(() => {
  resetQuickCreateMocks();
  useUserStore.setState({ people: [], users: [] });
});

function renderFlow(onFlowCompleted = vi.fn()) {
  const rendered = render(
    <QuickCreateFlow open onOpenChange={vi.fn()} onFlowCompleted={onFlowCompleted} mode="batch" />
  );
  return { ...rendered, onFlowCompleted };
}

type Driver = ReturnType<typeof renderFlow>['user'];

/** Person, then one dog (Ziggy), ending on the Dogs step. */
async function reachDogsWithZiggy(user: Driver) {
  await addPersonThroughForm(user);
  await user.click(await screen.findByRole('button', { name: 'Add First Dog' }));
  await fillDogBasics(user);
  await user.click(screen.getByRole('button', { name: /Next: Registration/ }));
  await user.click(await screen.findByRole('button', { name: /Next: Optional details/ }));
  await user.click(await screen.findByRole('button', { name: 'Add Dog' }));
  await screen.findByText('Dogs Added (1):');
}

async function completeSetup(user: Driver) {
  await user.click(await screen.findByRole('button', { name: 'Review' }));
  await user.click(await screen.findByRole('button', { name: 'Complete Setup' }));
}

/** Replaces the whole value of a field, as one change. */
function setField(field: HTMLElement, value: string) {
  fireEvent.change(field, { target: { value } });
}

describe('Quick Create dog Edit', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  it('opens the saved dog, and Cancel keeps the selection and creates nothing', async () => {
    const { user, onFlowCompleted } = renderFlow();
    await reachDogsWithZiggy(user);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(await screen.findByLabelText(/Call Name/i)).toHaveValue('Ziggy');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Dogs Added (1):')).toBeInTheDocument();
    expect(mocks.updateDog).not.toHaveBeenCalled();
    expect(mocks.refreshDogCreated).not.toHaveBeenCalled();
    expect(mocks.addDog).toHaveBeenCalledTimes(1);

    await completeSetup(user);
    expect(onFlowCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'person-1', dogs: ['dog-1'] }),
      [expect.objectContaining({ id: 'dog-1', callName: 'Ziggy' })]
    );
  });

  it('a refused save keeps the form open and the selected dog unchanged', async () => {
    mocks.updateDog.mockRejectedValue(new Error('server said no'));
    const { user, onFlowCompleted } = renderFlow();
    await reachDogsWithZiggy(user);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setField(await screen.findByLabelText(/Call Name/i), 'Zig');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.updateDog).toHaveBeenCalledTimes(1));
    expect(mocks.refreshDogCreated).not.toHaveBeenCalled();
    // Still the edit form, with what was typed, so the secretary can retry.
    expect(screen.getByLabelText(/Call Name/i)).toHaveValue('Zig');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // Leaving a dirty form asks first; discard it.
    await user.click(await screen.findByRole('button', { name: /Discard/i }));
    expect(await screen.findByText('Dogs Added (1):')).toBeInTheDocument();

    await completeSetup(user);
    expect(onFlowCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'person-1' }), [
      expect.objectContaining({ id: 'dog-1', callName: 'Ziggy' }),
    ]);
    expect(mocks.addDog).toHaveBeenCalledTimes(1);
  });

  it('a successful save updates the same dog id and creates no dog', async () => {
    const { user, onFlowCompleted } = renderFlow();
    await reachDogsWithZiggy(user);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setField(await screen.findByLabelText(/Call Name/i), 'Ziggy Zoom');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Dogs Added (1):')).toBeInTheDocument();
    expect(mocks.updateDog).toHaveBeenCalledTimes(1);
    expect(mocks.updateDog).toHaveBeenCalledWith(
      'dog-1',
      expect.objectContaining({ callName: 'Ziggy Zoom' })
    );
    expect(screen.getAllByText('Ziggy Zoom').length).toBeGreaterThan(0);
    // The one create was the original Add Dog; an edit is not "created this session".
    expect(mocks.addDog).toHaveBeenCalledTimes(1);
    expect(mocks.addDogOfflineFirst).not.toHaveBeenCalled();
    expect(mocks.recordDogCreated).toHaveBeenCalledTimes(1);
    // The "no entry yet" prompt names the dog by its current name.
    expect(mocks.refreshDogCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'dog-1', callName: 'Ziggy Zoom' })
    );

    await completeSetup(user);
    expect(onFlowCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'person-1' }), [
      expect.objectContaining({ id: 'dog-1', callName: 'Ziggy Zoom' }),
    ]);
  });

  it('a save keeps the flow dog whole when updateDog returns a stale derived dog', async () => {
    // The real updateDog builds its returned dog from data already in memory (no
    // owner, no health records, registrations from a cache a dog made seconds ago
    // is not in), so none of it may overwrite what the flow holds. The registrations
    // card is read-only, so they are not sent for a re-sync either.
    const registration = {
      id: 'reg-1',
      organization: 'AKC',
      registeredName: 'Ziggy of Mailbox',
      breed: 'Border Collie',
      registrationNumber: 'SR12345678',
    };
    const createDog = mocks.addDog.getMockImplementation();
    mocks.addDog.mockImplementation(async (...args: unknown[]) => ({
      ...(await createDog?.(...args)),
      breed: 'Border Collie',
      ownerName: 'Molly Mailbox',
      registrations: [registration],
    }));
    mocks.updateDog.mockImplementation(async (_id: string, updates: object) => ({
      id: 'dog-1',
      name: 'Ziggy',
      ...updates,
      breed: '',
      ownerName: '',
      registrations: [],
    }));
    const { user, onFlowCompleted } = renderFlow();
    await reachDogsWithZiggy(user);

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    setField(await screen.findByLabelText(/Call Name/i), 'Ziggy Zoom');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));
    expect(await screen.findByText('Dogs Added (1):')).toBeInTheDocument();

    expect(mocks.updateDog).toHaveBeenCalledWith(
      'dog-1',
      expect.not.objectContaining({ registrations: expect.anything() })
    );
    await completeSetup(user);
    expect(onFlowCompleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'person-1' }), [
      expect.objectContaining({
        id: 'dog-1',
        callName: 'Ziggy Zoom',
        breed: 'Border Collie',
        ownerName: 'Molly Mailbox',
        registrations: [expect.objectContaining({ registrationNumber: 'SR12345678' })],
      }),
    ]);
  });

  it('Add Another Dog still opens a blank create form and creates a second dog', async () => {
    mocks.addDog.mockResolvedValueOnce({
      id: 'dog-1',
      name: 'Ziggy',
      callName: 'Ziggy',
      gender: 'Male',
      dateOfBirth: '2020-01-01',
      registrations: [],
    });
    const { user } = renderFlow();
    await reachDogsWithZiggy(user);

    await user.click(screen.getByRole('button', { name: 'Add Another Dog' }));
    expect(await screen.findByLabelText(/Call Name/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Next: Registration/ })).toBeInTheDocument();
    expect(mocks.updateDog).not.toHaveBeenCalled();
  });
});

describe('Quick Create person Edit Details', { timeout: JOURNEY_TIMEOUT_MS }, () => {
  /** Person saved, then Back from Dogs to the Person step, where Edit Details lives. */
  async function reachPersonStep(user: Driver) {
    await addPersonThroughForm(user);
    await screen.findByRole('button', { name: 'Add First Dog' });
    await user.click(screen.getByRole('button', { name: 'Back' }));
    return await screen.findByRole('button', { name: 'Edit Details' });
  }

  it('opens the saved person, and Cancel keeps them and creates nobody', async () => {
    const { user } = renderFlow();
    await user.click(await reachPersonStep(user));
    expect(await screen.findByLabelText(/First Name/i)).toHaveValue('Molly');
    expect(screen.getByLabelText(/Last Name/i)).toHaveValue('Mailbox');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Person Added')).toBeInTheDocument();
    expect(screen.getByText('Molly Mailbox')).toBeInTheDocument();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
  });

  it('a successful save updates the same person id and creates nobody', async () => {
    mocks.updateUser.mockResolvedValue({
      data: { id: 'person-1', first_name: 'Mollie', last_name: 'Mailbox', email: null },
      error: null,
    });
    const { user } = renderFlow();
    await user.click(await reachPersonStep(user));
    setField(await screen.findByLabelText(/First Name/i), 'Mollie');
    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('Mollie Mailbox')).toBeInTheDocument();
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledWith(
      'person-1',
      expect.objectContaining({ first_name: 'Mollie' })
    );
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    expect(mocks.recordOwnerCreated).toHaveBeenCalledTimes(1);
    // The leave-early prompt reads the display name, so it must follow the rename.
    expect(mocks.refreshOwnerCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'person-1', firstName: 'Mollie', name: 'Mollie Mailbox' })
    );
  });

  it('an edited street address reaches both address fields the flow reads', async () => {
    const { user } = renderFlow();
    await user.click(await reachPersonStep(user));
    await user.click(await screen.findByRole('tab', { name: /Contact/i }));
    setField(await screen.findByLabelText(/Street Address/i), '12 Mail St');
    setField(screen.getByLabelText(/^City/i), 'Springfield');
    setField(screen.getByLabelText(/^State/i), 'IL');
    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.refreshOwnerCreated).toHaveBeenCalledTimes(1));
    expect(mocks.refreshOwnerCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'person-1',
        streetAddress: '12 Mail St',
        address: '12 Mail St',
      })
    );
  });

  it('a refused save keeps the person selected and the form open', async () => {
    mocks.updateUser.mockResolvedValue({ data: null, error: { message: 'no', code: 'X' } });
    const { user } = renderFlow();
    await user.click(await reachPersonStep(user));
    setField(await screen.findByLabelText(/First Name/i), 'Mollie');
    await user.click(await screen.findByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Person Added')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: /Discard/i }));
    const card = (await screen.findByText('Person Added')).closest('div') as HTMLElement;
    expect(within(card.parentElement as HTMLElement).getByText('Molly Mailbox')).toBeVisible();
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
  });
});

describe('Quick Create Edit Details after a duplicate selection', () => {
  it(
    'edits the EXISTING person by their own id and creates nobody',
    { timeout: JOURNEY_TIMEOUT_MS },
    async () => {
      const existing = {
        id: 'person-existing-1',
        firstName: 'Molly',
        lastName: 'Mailbox',
        email: 'molly@example.test',
        phone: '',
        dogs: [],
      };
      useUserStore.setState({ people: [existing], users: [existing] } as never);
      mocks.updateUser.mockResolvedValue({
        data: { id: 'person-existing-1', first_name: 'Mollie', last_name: 'Mailbox', email: null },
        error: null,
      });
      const { user } = renderFlow();
      for (const [label, value] of [
        [/First Name/i, 'Molly'],
        [/Last Name/i, 'Mailbox'],
        [/Email Address/i, 'molly@example.test'],
      ] as const) {
        await user.click(await screen.findByLabelText(label));
        await user.paste(value);
      }
      await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
      await user.click(await screen.findByRole('button', { name: 'Use This Person' }));
      await screen.findByRole('button', { name: 'Add First Dog' });
      await user.click(screen.getByRole('button', { name: 'Back' }));
      await user.click(await screen.findByRole('button', { name: 'Edit Details' }));
      setField(await screen.findByLabelText(/First Name/i), 'Mollie');
      await user.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(await screen.findByText('Mollie Mailbox')).toBeInTheDocument();
      expect(mocks.updateUser).toHaveBeenCalledWith(
        'person-existing-1',
        expect.objectContaining({ first_name: 'Mollie' })
      );
      expect(mocks.createUser).not.toHaveBeenCalled();
      expect(mocks.recordOwnerCreated).not.toHaveBeenCalled();
    }
  );
});
