import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071 round 2: the dog read stays on PostgREST and overlays only this
 * device's unsent writes, so a queued edit shows before upload and a row the
 * server deleted is never read back from the replica.
 */
const { serverIn, unsent, pendingPeople } = vi.hoisted(() => ({
  serverIn: vi.fn(),
  unsent: vi.fn(),
  pendingPeople: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: serverIn }) }) },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: unsent },
}));
vi.mock('@/services/replication/ReplicatedShowDeskPeopleTable', () => ({
  replicatedShowDeskPeopleTable: { getPeopleByIds: pendingPeople },
}));

import { loadDogRegistrations } from '../reads';
import { overlayPendingOwners } from '../pendingLocalOverlays';

describe('loadDogRegistrations overlays unsent registration writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a queued edit replaces its server row; the server decides everything else', async () => {
    serverIn.mockResolvedValue({
      data: [
        {
          id: 'r1',
          dog_id: 'dog-1',
          organization: 'AKC',
          registration_number: 'A1',
          registered_name: 'Old',
        },
      ],
      error: null,
    });
    unsent.mockResolvedValue([
      {
        id: 'r1',
        dog_id: 'dog-1',
        organization: 'AKC',
        registration_number: 'A1',
        registered_name: 'New',
      },
    ]);

    const result = await loadDogRegistrations(['dog-1']);

    expect(result.byDog.get('dog-1')).toEqual([
      expect.objectContaining({ id: 'r1', registered_name: 'New' }),
    ]);
    expect(result.registrationsReadComplete).toBe(true);
  });
});

describe('overlayPendingOwners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies a queued person edit to the roster owner and keeps the server email', async () => {
    pendingPeople.mockResolvedValue([
      {
        id: 'p1',
        firstName: 'Patricia',
        lastName: 'Owner',
        address: '2 New St',
        _syncStatus: 'pending',
      },
      { id: 'p2', firstName: 'Clean', lastName: 'Row', _syncStatus: 'synced' },
    ]);
    const owners = new Map([
      [
        'p1',
        {
          id: 'p1',
          first_name: 'Pat',
          last_name: 'Owner',
          email: 'p@x.test',
          phone: null,
          street_address: '1 Old St',
          city: null,
          state: null,
          zip_code: null,
        },
      ],
      [
        'p2',
        {
          id: 'p2',
          first_name: 'Server',
          last_name: 'Row',
          email: null,
          phone: null,
          street_address: null,
          city: null,
          state: null,
          zip_code: null,
        },
      ],
    ]);

    const result = await overlayPendingOwners(owners, ['p1', 'p2']);

    expect(result.get('p1')).toMatchObject({
      first_name: 'Patricia',
      street_address: '2 New St',
      email: 'p@x.test',
    });
    expect(result.get('p2')).toMatchObject({ first_name: 'Server' });
  });
});
