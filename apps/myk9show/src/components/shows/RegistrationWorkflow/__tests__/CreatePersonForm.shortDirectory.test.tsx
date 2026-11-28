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
const OTHER_SAVED: User = { id: 'person-saved-9', firstName: 'Zed', lastName: 'Zimmer' };

async function typePerson(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/First Name/i), 'Molly');
  await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
  await user.type(screen.getByLabelText(/Email Address/i), 'molly.mailbox@example.com');
}

function setOnline(online: boolean) {
  onlineManager.setOnline(online);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
}

describe('CreatePersonForm after a short directory refresh (MYK9-2253)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({
      people: [OTHER_SAVED],
      users: [OTHER_SAVED],
      directoryIncomplete: true,
      loadUsers: vi.fn(),
    });
    createUserMock.mockResolvedValue(
      fromAny({ data: { ...SERVER_ROW, id: 'person-new-1' }, error: null })
    );
  });

  afterEach(() => {
    setOnline(true);
    useUserStore.setState({ directoryIncomplete: false });
    vi.restoreAllMocks();
  });

  it('asks the server for a person missing from the saved copy and holds on the match', async () => {
    setOnline(true);
    // The lookup while typing never answers, so only the save-time check can find the match.
    let saving = false;
    searchUsersMock.mockImplementation(() =>
      saving ? Promise.resolve(fromAny({ data: [SERVER_ROW], error: null })) : new Promise(() => {})
    );
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    saving = true;
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByTestId('person-duplicate-notice')).toBeInTheDocument();
    expect(searchUsersMock).toHaveBeenCalledWith('Mailbox');
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('with the server down, says the check covered the saved people only', async () => {
    setOnline(false);
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);

    expect(await screen.findByTestId('person-duplicate-checked-saved')).toBeVisible();
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
  });

  it('a complete saved directory does not ask the server at save', async () => {
    setOnline(true);
    useUserStore.setState({ directoryIncomplete: false });
    searchUsersMock.mockResolvedValue(fromAny({ data: [], error: null }));
    const user = userEvent.setup();
    render(<CreatePersonForm open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await typePerson(user);
    await waitFor(() => expect(searchUsersMock).toHaveBeenCalled());
    const callsBeforeSave = searchUsersMock.mock.calls.length;
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(createUserMock).toHaveBeenCalled());
    expect(searchUsersMock).toHaveBeenCalledTimes(callsBeforeSave);
  });

  it('the fresh server row wins over a names-only saved row for the same person', async () => {
    setOnline(true);
    const namesOnly: User = { id: SERVER_ROW.id, firstName: 'Molly', lastName: 'Mailbox' };
    useUserStore.setState({ people: [namesOnly], users: [namesOnly] });
    searchUsersMock.mockResolvedValue(fromAny({ data: [SERVER_ROW], error: null }));
    const onDuplicateSelected = vi.fn();
    const user = userEvent.setup();
    render(
      <CreatePersonForm
        open
        onOpenChange={vi.fn()}
        onExhibitorCreated={vi.fn()}
        onDuplicateSelected={onDuplicateSelected}
      />
    );

    await typePerson(user);
    await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await user.click(await screen.findByRole('button', { name: /Use This Person/i }));

    await waitFor(() => expect(onDuplicateSelected).toHaveBeenCalled());
    expect(onDuplicateSelected.mock.calls[0][0]).toMatchObject({
      id: SERVER_ROW.id,
      phone: '555-1000',
    });
  });
});
