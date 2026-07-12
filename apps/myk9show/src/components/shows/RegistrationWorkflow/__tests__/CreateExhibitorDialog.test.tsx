import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { createUser } from '@/services/database/users';
import { useUserStore } from '@/store/userStore';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';

const { mockCreatePerson, mockGetPendingPersonMutationIdsForRow } = vi.hoisted(() => ({
  mockCreatePerson: vi.fn(),
  mockGetPendingPersonMutationIdsForRow: vi.fn(),
}));

vi.mock('@/services/database/users', () => ({
  createUser: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: mockCreatePerson,
    getPendingMutationIdsForRow: mockGetPendingPersonMutationIdsForRow,
  },
}));

const createUserMock = vi.mocked(createUser);

describe('CreateExhibitorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.setState({ people: [], users: [] });
    mockCreatePerson.mockResolvedValue({
      id: 'person-local-1',
      firstName: 'Molly',
      lastName: 'Mailbox',
      email: 'molly.mailbox@example.com',
      phone: '555-1000',
      address: '123 Paper Trail',
      city: 'Envelope',
      state: 'TX',
      zipCode: '75001',
      status: 'active',
    });
    mockGetPendingPersonMutationIdsForRow.mockResolvedValue(['person-mutation-1']);
  });

  it('persists a mail-in exhibitor as a people row', async () => {
    createUserMock.mockResolvedValue({
      data: {
        agreed_to_tos_at: null,
        auth_user_id: null,
        bio: null,
        id: 'person-mailin-1',
        first_name: 'Molly',
        last_name: 'Mailbox',
        email: 'molly.mailbox@example.com',
        phone: '555-1000',
        street_address: '123 Paper Trail',
        city: 'Envelope',
        country: null,
        created_at: null,
        deleted_at: null,
        deleted_by: null,
        early_adopter_until: null,
        license_key: null,
        profile_image: null,
        state: 'TX',
        status: 'active',
        updated_at: null,
        zip_code: '75001',
      },
      error: null,
    });

    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateExhibitorDialog open onOpenChange={vi.fn()} onExhibitorCreated={onExhibitorCreated} />
    );

    await user.type(screen.getByLabelText(/First Name/i), 'Molly');
    await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
    await user.type(screen.getByLabelText(/Email Address/i), 'molly.mailbox@example.com');
    await user.type(screen.getByLabelText(/Phone Number/i), '555-1000');
    await user.type(screen.getByLabelText(/Street Address/i), '123 Paper Trail');
    await user.type(screen.getByLabelText(/City/i), 'Envelope');
    await user.type(screen.getByLabelText(/State/i), 'TX');
    await user.type(screen.getByLabelText(/ZIP Code/i), '75001');

    await user.click(screen.getByRole('button', { name: 'Create Exhibitor' }));

    await waitFor(() => {
      expect(createUserMock).toHaveBeenCalledWith({
        first_name: 'Molly',
        last_name: 'Mailbox',
        email: 'molly.mailbox@example.com',
        phone: '555-1000',
        street_address: '123 Paper Trail',
        city: 'Envelope',
        state: 'TX',
        zip_code: '75001',
      });
    });

    await waitFor(() => {
      expect(onExhibitorCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'person-mailin-1',
          firstName: 'Molly',
          lastName: 'Mailbox',
          roles: [UserRole.EXHIBITOR],
          dogs: [],
        })
      );
    });
  });

  it('offers a real loaded person as a duplicate instead of using mock data', async () => {
    useUserStore.setState({
      people: [
        {
          id: 'person-existing-1',
          firstName: 'Tera',
          lastName: 'Handler',
          email: 'tera@example.com',
          phone: '555-1212',
          dogs: [],
        },
      ],
      users: [
        {
          id: 'person-existing-1',
          firstName: 'Tera',
          lastName: 'Handler',
          email: 'tera@example.com',
          phone: '555-1212',
          dogs: [],
        },
      ],
    });

    const onDuplicateSelected = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateExhibitorDialog
        open
        onOpenChange={vi.fn()}
        onExhibitorCreated={vi.fn()}
        onDuplicateSelected={onDuplicateSelected}
      />
    );

    await user.type(screen.getByLabelText(/First Name/i), 'Tera');
    await user.type(screen.getByLabelText(/Last Name/i), 'Handler');
    await user.type(screen.getByLabelText(/Email Address/i), 'TERA@example.com');

    expect(await screen.findByText('Tera Handler')).toBeInTheDocument();
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use This User' }));

    expect(onDuplicateSelected).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'person-existing-1' })
    );
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('uses the show-desk people queue in offline-first mode', async () => {
    createUserMock.mockRejectedValue(new Error('network unavailable'));
    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateExhibitorDialog
        open
        onOpenChange={vi.fn()}
        onExhibitorCreated={onExhibitorCreated}
        offlineFirst
      />
    );

    await user.type(screen.getByLabelText(/First Name/i), 'Molly');
    await user.type(screen.getByLabelText(/Last Name/i), 'Mailbox');
    await user.type(screen.getByLabelText(/Email Address/i), 'molly.mailbox@example.com');
    await user.type(screen.getByLabelText(/Phone Number/i), '555-1000');
    await user.type(screen.getByLabelText(/Street Address/i), '123 Paper Trail');
    await user.type(screen.getByLabelText(/City/i), 'Envelope');
    await user.type(screen.getByLabelText(/State/i), 'TX');
    await user.type(screen.getByLabelText(/ZIP Code/i), '75001');

    await user.click(screen.getByRole('button', { name: 'Create Exhibitor' }));

    await waitFor(() => {
      expect(mockCreatePerson).toHaveBeenCalledWith({
        firstName: 'Molly',
        lastName: 'Mailbox',
        email: 'molly.mailbox@example.com',
        phone: '555-1000',
        address: '123 Paper Trail',
        city: 'Envelope',
        state: 'TX',
        zipCode: '75001',
      });
    });
    expect(createUserMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(onExhibitorCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'person-local-1',
          firstName: 'Molly',
          lastName: 'Mailbox',
          roles: [UserRole.EXHIBITOR],
          dogs: [],
        }),
        { pendingMutationIds: ['person-mutation-1'] }
      );
    });
  });
});
