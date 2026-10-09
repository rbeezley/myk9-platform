import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071 round 2: the dog read stays on PostgREST and overlays only this
 * device's unsent writes, so a queued edit shows before upload and a row the
 * server deleted is never read back from the replica.
 */
const { serverIn, unsent } = vi.hoisted(() => ({
  serverIn: vi.fn(),
  unsent: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: serverIn }) }) },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: unsent },
}));

import { loadDogRegistrations } from '../reads';

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
