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
vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: vi.fn(),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: vi.fn(),
    getPendingMutationIdsForRow: vi.fn(),
  },
}));

const createUserMock = vi.mocked(createUser);

async function toContact(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
}

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
    await toContact(user);
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

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
    await toContact(user);
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const [title, options] = mocks.error.mock.calls[0] as [string, { description: string }];
    expect(`${title} ${options.description}`).toMatch(/Your changes are still here\. Try again\./);
    expect(`${title} ${options.description}`).not.toMatch(/people_email_key/);
    expect(mocks.success).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: /Basic Info/ }));
    expect(screen.getByLabelText(/First Name/i)).toHaveValue('Molly');
  });

  it('keeps the SQLSTATE so a duplicate email reads as a duplicate, not an outage', async () => {
    createUserMock.mockResolvedValue(
      fromAny({
        data: null,
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "people_email_key"',
        },
      })
    );
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await toContact(user);
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    const [title, options] = mocks.error.mock.calls[0] as [string, { description: string }];
    const copy = `${title} ${options.description}`;
    expect(copy).toMatch(/This record already exists\./);
    expect(copy).not.toMatch(/Try again/);
    expect(copy).not.toMatch(/people_email_key/);
  });

  it('ignores Escape while the save is in flight, and the details survive a failure', async () => {
    let rejectSave: (reason: unknown) => void = () => {};
    createUserMock.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectSave = reject;
      })
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={onOpenChange} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await toContact(user);
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));
    await screen.findByRole('button', { name: 'Saving...' });

    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Discard changes?')).not.toBeInTheDocument();

    rejectSave(new Error('network down'));
    await waitFor(() => expect(mocks.error).toHaveBeenCalled());
    await user.click(screen.getByRole('tab', { name: /Basic Info/ }));
    expect(screen.getByLabelText(/First Name/i)).toHaveValue('Molly');
    expect(screen.getByLabelText(/Last Name/i)).toHaveValue('Mailbox');
  });

  it('uses the one pending label, Saving...', async () => {
    createUserMock.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} />);

    await fillName(user);
    await toContact(user);
    await user.click(await screen.findByRole('button', { name: 'Add Person' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeInTheDocument();
  });
});
