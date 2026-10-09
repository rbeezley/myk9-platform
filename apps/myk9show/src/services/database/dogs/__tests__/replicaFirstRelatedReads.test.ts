import { beforeEach, describe, expect, it, vi } from 'vitest';

const { registrations, people } = vi.hoisted(() => ({
  registrations: { isCold: vi.fn(), getRegistrationsForDogsPartitioned: vi.fn() },
  people: { isCold: vi.fn(), getPeopleByIds: vi.fn() },
}));

vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: registrations,
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: people,
}));

import { readWarmReplicaOwners, readWarmReplicaRegistrations } from '../replicaFirstRelatedReads';

describe('replica-first related reads (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a warm registrations replica answers, split into server-known and local-only rows', async () => {
    registrations.isCold.mockResolvedValue(false);
    const split = { synced: [{ id: 'r1', dog_id: 'd1' }], local: [{ id: 'l1', dog_id: 'd1' }] };
    registrations.getRegistrationsForDogsPartitioned.mockResolvedValue(split);
    expect(await readWarmReplicaRegistrations(['d1'])).toEqual(split);
  });

  it('a cold or unreadable registrations replica returns null so the server answers', async () => {
    registrations.isCold.mockResolvedValue(true);
    expect(await readWarmReplicaRegistrations(['d1'])).toBeNull();
    registrations.isCold.mockResolvedValue(false);
    registrations.getRegistrationsForDogsPartitioned.mockRejectedValue(new Error('idb'));
    expect(await readWarmReplicaRegistrations(['d1'])).toBeNull();
  });

  it('a warm people replica answers the owner columns', async () => {
    people.isCold.mockResolvedValue(false);
    people.getPeopleByIds.mockResolvedValue([
      { id: 'p1', firstName: 'Pat', lastName: 'Owner', address: '9 Oak', status: 'active' },
    ]);
    const owners = await readWarmReplicaOwners(['p1']);
    expect(owners?.get('p1')).toEqual({
      id: 'p1',
      first_name: 'Pat',
      last_name: 'Owner',
      email: null,
      phone: null,
      street_address: '9 Oak',
      city: null,
      state: null,
      zip_code: null,
    });
  });

  it('falls back when an owner is missing locally, rather than showing a partial map', async () => {
    people.isCold.mockResolvedValue(false);
    people.getPeopleByIds.mockResolvedValue([]);
    expect(await readWarmReplicaOwners(['p1'])).toBeNull();
  });
});
