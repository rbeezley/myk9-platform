import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * MYK9-1071: a WARM registrations replica answers loadDogRegistrations alone,
 * merged exactly like the cold server+replica read: server-known rows first, a
 * local mirror of a registration the server holds under its own id is dropped,
 * and the mirror's creation order still overlays the server row.
 */
const { serverIn, warm } = vi.hoisted(() => ({ serverIn: vi.fn(), warm: vi.fn() }));

vi.mock('../../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: serverIn }) }) },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('../replicaFirstRelatedReads', () => ({
  readWarmReplicaRegistrations: warm,
  readWarmReplicaOwners: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: vi.fn().mockResolvedValue([]) },
}));

import { loadDogRegistrations } from '../reads';

describe('loadDogRegistrations with a warm replica (MYK9-1071)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('answers from the replica, a complete read, with no server request', async () => {
    warm.mockResolvedValue({
      synced: [
        {
          id: 'server-1',
          dog_id: 'dog-1',
          organization: 'UKC',
          registration_number: 'P1',
          created_at: '2025-06-01T12:00:00.000Z',
        },
      ],
      local: [
        {
          id: 'mirror-1',
          dog_id: 'dog-1',
          organization: 'UKC',
          registration_number: 'P1',
          created_at: '2025-06-01T11:00:00.000Z',
        },
        { id: 'pending-1', dog_id: 'dog-1', organization: 'AKC', registration_number: 'A1' },
      ],
    });

    const result = await loadDogRegistrations(['dog-1', 'dog-2']);

    expect(serverIn).not.toHaveBeenCalled();
    expect(result.registrationsReadComplete).toBe(true);
    const rows = result.byDog.get('dog-1')!;
    expect(rows.map(row => row.id)).toEqual(['server-1', 'pending-1']);
    expect(rows[0]).toMatchObject({ created_at: '2025-06-01T11:00:00.000Z' });
    // Present-and-empty: dog-2 genuinely has none.
    expect(result.byDog.get('dog-2')).toBeUndefined();
  });

  it('a cold replica keeps the server read', async () => {
    warm.mockResolvedValue(null);
    serverIn.mockResolvedValue({ data: [], error: null });
    await loadDogRegistrations(['dog-1']);
    expect(serverIn).toHaveBeenCalled();
  });
});
