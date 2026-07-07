import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@/test/utils/testUtils';
import { render, userEvent } from '@/test/utils/testUtils';
import { UserRole } from '@/types/auth-types';
import { createUser } from '@/services/database/users';
import { CreateExhibitorDialog } from '../CreateExhibitorDialog';

const { mockCreatePerson } = vi.hoisted(() => ({
  mockCreatePerson: vi.fn(),
}));

vi.mock('@/services/database/users', () => ({
  createUser: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: {
    createPerson: mockCreatePerson,
  },
}));

const createUserMock = vi.mocked(createUser);

describe('CreateExhibitorDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('persists a mail-in exhibitor as a people row', async () => {
    createUserMock.mockResolvedValue({
      data: {
        id: 'person-mailin-1',
        first_name: 'Molly',
        last_name: 'Mailbox',
        email: 'molly.mailbox@example.com',
        phone: '555-1000',
        street_address: '123 Paper Trail',
        city: 'Envelope',
        state: 'TX',
        zip_code: '75001',
      },
      error: null,
    });

    const onExhibitorCreated = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateExhibitorDialog
        open
        onOpenChange={vi.fn()}
        onExhibitorCreated={onExhibitorCreated}
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
        })
      );
    });
  });
});
