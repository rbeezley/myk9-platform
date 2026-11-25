import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { onlineManager } from '@tanstack/react-query';
import { fromAny } from '@total-typescript/shoehorn';
import { createUser, searchUsers } from '@/services/database/users';
import type { User } from '@/types/user-types';
import { useUserStore } from '@/store/userStore';
import { CreatePersonForm } from '../CreatePersonForm';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: vi.fn(),
  searchUsers: vi.fn(),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));

const createUserMock = vi.mocked(createUser);
const searchUsersMock = vi.mocked(searchUsers);

const SERVER_ROW = {
  id: 'person-server-1',
  first_name: 'Molly',
  last_name: 'Mailbox',
  email: 'molly.mailbox@example.com',
  phone: '555-1000',
};

async function typePerson(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/First Name/i), 'Molly');
  await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
  await user.type(screen.getByLabelText(/Email Address/i), 'molly.mailbox@example.com');
}

function setOnline(online: boolean) {
  onlineManager.setOnline(online);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

describe('CreatePersonForm on a device with no saved people (MYK9-2257)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The empty directory is a cold device: the store load adds nothing.
    useUserStore.setState({ people: [], users: [], loadUsers: vi.fn() });
    createUserMock.mockResolvedValue(
      fromAny({ data: { ...SERVER_ROW, id: 'person-new-1' }, error: null })
    );
  });

  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it('online: asks the server and finds the matching person', async () => {
    setOnline(true);
    searchUsersMock.mockResolvedValue(fromAny({ data: [SERVER_ROW], error: null }));
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(searchUsersMock).toHaveBeenCalledWith('molly.mailbox@example.com');
    expect(searchUsersMock).toHaveBeenCalledWith('Mailbox');
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('offline: says it could not check, and the person can still be added', async () => {
    setOnline(false);
    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={onExhibitorCreated} />
    );

    await typePerson(user);

    expect(await screen.findByText(/Can't check for an existing person right now/)).toBeVisible();
    expect(searchUsersMock).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
    expect(screen.queryByTestId('person-duplicate-notice')).not.toBeInTheDocument();
  });

  it('online but the server search fails: also says it could not check', async () => {
    setOnline(true);
    searchUsersMock.mockResolvedValue(fromAny({ data: [], error: new Error('boom') }));
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);

    expect(await screen.findByText(/Can't check for an existing person right now/)).toBeVisible();

    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
  });

  it('online with no server match: the person is created', async () => {
    setOnline(true);
    searchUsersMock.mockResolvedValue(fromAny({ data: [], error: null }));
    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={onExhibitorCreated} />
    );

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
    expect(onExhibitorCreated).toHaveBeenCalled();
    expect(screen.queryByTestId('person-duplicate-notice')).not.toBeInTheDocument();
  });

  it('keeps the rows of a term that answered when the other term fails', async () => {
    setOnline(true);
    searchUsersMock.mockImplementation(async term =>
      term === 'Mailbox'
        ? fromAny({ data: [SERVER_ROW], error: null })
        : fromAny({ data: [], error: new Error('boom') })
    );
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('reuses a failed debounced answer at save instead of asking the server again', async () => {
    setOnline(true);
    searchUsersMock.mockResolvedValue(fromAny({ data: [], error: new Error('boom') }));
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    expect(await screen.findByText(/Can't check for an existing person right now/)).toBeVisible();
    const callsBeforeSave = searchUsersMock.mock.calls.length;

    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
    expect(searchUsersMock).toHaveBeenCalledTimes(callsBeforeSave);
  });

  it('does not reuse an answer settled for an earlier identity', async () => {
    setOnline(true);
    // The first identity's answer is empty; by the time the identity changes the server
    // has the person. Reusing the earlier answer would add a duplicate.
    let serverHasPerson = false;
    searchUsersMock.mockImplementation(async () =>
      fromAny({ data: serverHasPerson ? [SERVER_ROW] : [], error: null })
    );
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalledWith('Mailbox'));
    serverHasPerson = true;
    await user.type(screen.getByLabelText(/Last Name/i), 'x');

    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('a lookup that never answers does not hold the save past the deadline', async () => {
    setOnline(true);
    searchUsersMock.mockReturnValue(new Promise(() => {}));
    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();
    render(
      <CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={onExhibitorCreated} />
    );

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalled(), { timeout: 6000 });
    await waitFor(() => expect(onExhibitorCreated).toHaveBeenCalled());
  }, 15000);
});

describe('CreatePersonForm offline with a saved people directory (MYK9-2265)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const saved: User[] = [
      {
        id: 'person-saved-1',
        firstName: 'Molly',
        lastName: 'Mailbox',
        email: 'molly.mailbox@example.com',
      },
    ];
    useUserStore.setState({ people: saved, users: saved, loadUsers: vi.fn() });
  });

  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it('catches a person already saved on this device and says what the check covered', async () => {
    setOnline(false);
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    expect(await screen.findByTestId('person-duplicate-checked-saved')).toHaveTextContent(
      'Checked the people saved on this device.'
    );
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(screen.getByTestId('person-duplicate-checked-saved')).toBeInTheDocument();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Can't check for an existing person/)).not.toBeInTheDocument();
  });
});

describe('CreatePersonForm cold device with one stalled search term (MYK9-2257)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ people: [], users: [], loadUsers: vi.fn() });
    createUserMock.mockResolvedValue(
      fromAny({ data: { ...SERVER_ROW, id: 'person-new-1' }, error: null })
    );
  });

  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it.each([
    ['email', 'Mailbox'],
    ['last name', 'molly.mailbox@example.com'],
  ])(
    'shows the duplicate notice when the %s search stalls but the other answered',
    async (_stalled, answeredTerm) => {
      setOnline(true);
      searchUsersMock.mockImplementation(term =>
        term === answeredTerm
          ? Promise.resolve(fromAny({ data: [SERVER_ROW], error: null }))
          : new Promise(() => {})
      );
      const user = userEvent.setup();
      render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

      await typePerson(user);
      await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
      await user.click(await screen.findByRole('button', { name: 'Add Person' }));

      expect(
        await screen.findByTestId('person-duplicate-notice', {}, { timeout: 8000 })
      ).toBeInTheDocument();
      expect(createUserMock).not.toHaveBeenCalled();
    },
    15000
  );
});
