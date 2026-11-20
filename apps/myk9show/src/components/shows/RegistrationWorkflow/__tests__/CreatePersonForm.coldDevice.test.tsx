import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { onlineManager } from '@tanstack/react-query';
import { fromAny } from '@total-typescript/shoehorn';
import { createUser, searchUsers } from '@/services/database/users';
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
  });
});
