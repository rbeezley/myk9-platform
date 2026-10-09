import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071: a person save goes through the replication mutation queue, so it
 * is not lost at a show with no connection. It used to call update_person_details
 * over the network directly. Email changes stay online-only (decision D2).
 */
const { replica, directDb } = vi.hoisted(() => ({
  replica: {
    getPersonById: vi.fn(),
    updatePerson: vi.fn(),
  },
  directDb: {
    getAllUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: replica,
}));
vi.mock('@/services/database/users', () => directDb);

import { useUpdatePerson } from '@/hooks/useUsers';
import type { User } from '@/types/user-types';

const stored = {
  id: 'person-1',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'pat@example.test',
  phone: null,
  address: '9 Oak Ave',
  city: 'Edison',
  state: 'NJ',
  zipCode: '08817',
  authUserId: 'auth-1',
  status: 'active',
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useUpdatePerson(), { wrapper });
}

const save = (overrides: Partial<User>) =>
  ({
    id: 'person-1',
    firstName: 'Pat',
    lastName: 'Owner',
    email: 'pat@example.test',
    streetAddress: '9 Oak Ave',
    city: 'Edison',
    state: 'NJ',
    zipCode: '08817',
    ...overrides,
  }) as User;

describe('useUpdatePerson queues the save (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.getPersonById.mockResolvedValue(stored);
    replica.updatePerson.mockResolvedValue('mutation-1');
    directDb.updateUser.mockResolvedValue({ data: { id: 'person-1' }, error: null });
  });

  it('queues the people columns and never calls the direct update', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.mutateAsync(save({ firstName: 'Patricia' }));
    });

    expect(replica.updatePerson).toHaveBeenCalledWith(
      'person-1',
      expect.objectContaining({ first_name: 'Patricia', street_address: '9 Oak Ave' }),
      {}
    );
    // The unchanged sign-in email is never part of a queued save.
    expect(replica.updatePerson.mock.calls[0]?.[1]).not.toHaveProperty('email');
    expect(directDb.updateUser).not.toHaveBeenCalled();
  });

  it('refuses an email change while offline and queues nothing', async () => {
    const onLine = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync(save({ email: 'new@example.test' }))).rejects.toThrow(
        /online/i
      );
    });
    onLine.mockRestore();

    expect(replica.updatePerson).not.toHaveBeenCalled();
    expect(directDb.updateUser).not.toHaveBeenCalled();
  });
});
