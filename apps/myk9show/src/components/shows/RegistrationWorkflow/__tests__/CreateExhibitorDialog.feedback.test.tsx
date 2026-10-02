import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { createUser } from '@/services/database/users';
import { useUserStore } from '@/store/userStore';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: { success: mocks.success, error: mocks.error, warning: vi.fn(), info: vi.fn() },
}));
vi.mock('@/services/database/users', () => ({ createUser: vi.fn() }));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: vi.fn(),
    getPendingMutationIdsForRow: vi.fn(),
  },
}));

const createUserMock = vi.mocked(createUser);

async function fillName(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/First Name/i), 'Molly');
  await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
}

describe('CreateExhibitorDialog feedback (entry-flow Add Person)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ people: [], users: [] });
  });

  it('prompts before Cancel throws away typed details', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={onOpenChange} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes without a prompt when nothing was typed', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={onOpenChange} onExhibitorCreated={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();
  });

  it('confirms the added person with a toast', async () => {
    createUserMock.mockResolvedValue(
      fromAny({
        data: { id: 'p1', first_name: 'Molly', last_name: 'Mailbox', email: null, phone: null },
        error: null,
      })
    );
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await user.click(screen.getByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Molly Mailbox added'));
  });

  it('shows friendly copy, not the raw database message, when adding fails', async () => {
    createUserMock.mockResolvedValue(
      fromAny({
        data: null,
        error: { message: 'duplicate key value violates unique constraint "people_email_key"' },
      })
    );
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await user.click(screen.getByRole('button', { name: 'Add Person' }));

    expect(
      await screen.findByText(/Your changes are still here\. Try again\./)
    ).toBeInTheDocument();
    expect(screen.queryByText(/people_email_key/)).not.toBeInTheDocument();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/First Name/i)).toHaveValue('Molly');
  });

  it('uses the one pending label, Saving...', async () => {
    createUserMock.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await user.click(screen.getByRole('button', { name: 'Add Person' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeInTheDocument();
  });
});
