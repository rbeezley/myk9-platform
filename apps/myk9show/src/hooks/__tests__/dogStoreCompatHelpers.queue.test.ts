import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071: a registration edit made with the dog's edit form must go through
 * the replication mutation queue. It used to read and write dog_registrations
 * directly over PostgREST, so an offline edit was lost.
 */
const { replica, directDb } = vi.hoisted(() => ({
  replica: {
    getLocalRegistrationsForDog: vi.fn(),
    updateRegistration: vi.fn(),
    createRegistrationsForDog: vi.fn(),
  },
  directDb: {
    getRegistrationsByDog: vi.fn(),
    updateRegistration: vi.fn(),
    createRegistration: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: replica,
}));
vi.mock('@/services/database/registrations', () => directDb);

import { syncDogRegistrations } from '@/hooks/dogStoreCompatHelpers';

const existing = {
  id: 'reg-1',
  dogId: 'dog-1',
  organization: 'AKC (American Kennel Club)',
  registrationNumber: 'SR1',
  registeredName: 'Old Name',
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('syncDogRegistrations queues registration writes (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replica.getLocalRegistrationsForDog.mockResolvedValue([existing]);
    replica.updateRegistration.mockResolvedValue('mutation-1');
    replica.createRegistrationsForDog.mockResolvedValue([]);
    directDb.getRegistrationsByDog.mockResolvedValue({
      data: [{ id: 'reg-1', organization: 'AKC (American Kennel Club)' }],
      error: null,
    });
    directDb.updateRegistration.mockResolvedValue({ data: null, error: null });
    directDb.createRegistration.mockResolvedValue({ data: null, error: null });
  });

  it('queues an UPDATE for the matching organization and writes nothing directly', async () => {
    const changed = await syncDogRegistrations('dog-1', [
      { organization: 'AKC', registeredName: 'New Name', type: 'Beagle', status: 'active' },
    ]);

    expect(changed).toBe(true);
    expect(replica.updateRegistration).toHaveBeenCalledWith('reg-1', {
      registeredName: 'New Name',
      breed: 'Beagle',
      status: 'active',
    });
    expect(directDb.updateRegistration).not.toHaveBeenCalled();
    expect(directDb.getRegistrationsByDog).not.toHaveBeenCalled();
  });

  it('edits the canonical server row, never the local mirror of the dog create RPC (P1)', async () => {
    replica.getLocalRegistrationsForDog.mockResolvedValue([
      { ...existing, id: 'mirror-1', _localOnly: true },
      existing,
    ]);
    await syncDogRegistrations('dog-1', [{ organization: 'AKC', registeredName: 'New Name' }]);
    expect(replica.updateRegistration).toHaveBeenCalledTimes(1);
    expect(replica.updateRegistration.mock.calls[0]?.[0]).toBe('reg-1');
  });

  it('queues an INSERT for a new organization behind the given dependencies', async () => {
    await syncDogRegistrations(
      'dog-1',
      [{ organization: 'UKC', registeredName: 'UKC Name', number: 'U1', type: 'Beagle' }],
      { dependsOn: ['dog-insert'] }
    );

    expect(replica.createRegistrationsForDog).toHaveBeenCalledWith(
      'dog-1',
      [
        {
          organization: 'UKC',
          registeredName: 'UKC Name',
          number: 'U1',
          type: 'Beagle',
          status: '',
        },
      ],
      { dependsOn: ['dog-insert'] }
    );
    expect(directDb.createRegistration).not.toHaveBeenCalled();
  });
});
