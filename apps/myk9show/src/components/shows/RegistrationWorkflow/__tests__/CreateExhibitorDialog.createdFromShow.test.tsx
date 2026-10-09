import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { createUser } from '@/services/database/users';
import { useUserStore } from '@/store/userStore';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';

// MYK9-1059: a person added from the add-entry flow records the show; a person
// added anywhere else does not.
const SHOW_ID = '6349d047-34fe-4307-b29a-c1ae6d7750c7';
const { mockCreatePerson, mockPendingIds } = vi.hoisted(() => ({
  mockCreatePerson: vi.fn(),
  mockPendingIds: vi.fn(),
}));

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  createUser: vi.fn(),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: mockCreatePerson,
    getPendingMutationIdsForRow: mockPendingIds,
  },
}));

async function addPerson(props: { offlineFirst?: boolean; createdFromShowId?: string }) {
  const user = userEvent.setup();
  render(
    <CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={vi.fn()} {...props} />
  );
  await user.type(screen.getByLabelText(/First Name/i), 'Molly');
  await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
  await user.click(await screen.findByRole('button', { name: /Next: Contact/ }));
  await user.type(screen.getByLabelText(/Street Address/i), '123 Paper Trail');
  await user.type(screen.getByLabelText(/City/i), 'Envelope');
  await user.type(screen.getByLabelText(/State/i), 'TX');
  await user.type(screen.getByLabelText(/ZIP Code/i), '75001');
  await user.click(await screen.findByRole('button', { name: 'Add Person' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  useUserStore.setState({ people: [], users: [] });
  mockCreatePerson.mockResolvedValue({ id: 'p-1', firstName: 'Molly', lastName: 'Mailbox' });
  mockPendingIds.mockResolvedValue([]);
  vi.mocked(createUser).mockResolvedValue(
    fromAny({ data: { id: 'p-1', first_name: 'Molly', last_name: 'Mailbox' }, error: null })
  );
});

describe('CreateExhibitorDialog created_from_show_id (MYK9-1059)', () => {
  it('online: createUser receives the show id', async () => {
    await addPerson({ createdFromShowId: SHOW_ID });
    await waitFor(() =>
      expect(createUser).toHaveBeenCalledWith(
        expect.objectContaining({ created_from_show_id: SHOW_ID })
      )
    );
  });

  it('online without a show: createUser gets no created_from_show_id', async () => {
    await addPerson({});
    await waitFor(() => expect(createUser).toHaveBeenCalled());
    expect(vi.mocked(createUser).mock.calls[0]![0]).not.toHaveProperty('created_from_show_id');
  });

  it('offline-first: createPerson receives the show id', async () => {
    await addPerson({ offlineFirst: true, createdFromShowId: SHOW_ID });
    await waitFor(() =>
      expect(mockCreatePerson).toHaveBeenCalledWith(
        expect.objectContaining({ createdFromShowId: SHOW_ID })
      )
    );
  });
});
