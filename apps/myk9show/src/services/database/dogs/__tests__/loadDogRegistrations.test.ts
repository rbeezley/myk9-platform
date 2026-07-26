import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockServerIn, mockLocalGet } = vi.hoisted(() => ({
  mockServerIn: vi.fn(),
  mockLocalGet: vi.fn(),
}));

vi.mock('../../supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ in: mockServerIn }) }) },
  logQuery: vi.fn(),
  createDatabaseError: (e: unknown) => e,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: mockLocalGet },
}));

import { loadDogRegistrations } from '../reads';
import { resolveDogIdentity } from '@/features/dogs/identity';

/**
 * MYK9-90 review round 4, finding 2.
 *
 * `create_dog_with_registrations` now preserves each registration's client-side
 * `created_at`, so a second device can resolve the same primary without the
 * creating device's local mirror.
 */
describe('loadDogRegistrations', () => {
  beforeEach(() => vi.clearAllMocks());

  // The UUIDs sort opposite to the order the exhibitor entered the rows. The
  // server timestamps are the ordered values written by the RPC migration.
  const serverRows = [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000000',
      dog_id: 'dog-1',
      created_at: '2025-06-01T11:59:59.000Z',
      organization: 'UKC',
      registration_number: 'P935-254',
      breed: 'Belgian Shepherd Dog',
    },
    {
      id: 'zzzzzzzz-0000-4000-8000-000000000000',
      dog_id: 'dog-1',
      created_at: '2025-06-01T11:59:58.000Z',
      organization: 'AKC',
      registration_number: 'DN61191906',
      breed: 'Belgian Malinois',
    },
  ];

  it('overlays the local creation order onto identical server timestamps', async () => {
    mockServerIn.mockResolvedValue({ data: serverRows, error: null });
    // Local mirror: AKC was entered FIRST, so it is the primary.
    mockLocalGet.mockResolvedValue([
      {
        id: 'local-akc',
        dog_id: 'dog-1',
        created_at: '2025-06-01T11:59:58.000Z',
        organization: 'AKC',
        registration_number: 'DN61191906',
        breed: 'Belgian Malinois',
      },
      {
        id: 'local-ukc',
        dog_id: 'dog-1',
        created_at: '2025-06-01T11:59:59.000Z',
        organization: 'UKC',
        registration_number: 'P935-254',
        breed: 'Belgian Shepherd Dog',
      },
    ]);

    const { byDog } = await loadDogRegistrations(['dog-1']);
    expect(resolveDogIdentity(byDog.get('dog-1')!).breed).toBe('Belgian Malinois');
  });

  it('without a local mirror preserves the server creation order', async () => {
    mockServerIn.mockResolvedValue({ data: serverRows, error: null });
    mockLocalGet.mockResolvedValue([]);

    const { byDog } = await loadDogRegistrations(['dog-1']);
    expect(resolveDogIdentity(byDog.get('dog-1')!).breed).toBe('Belgian Malinois');
  });

  it('reports the server error so callers can refuse rather than assume absence', async () => {
    mockServerIn.mockResolvedValue({ data: null, error: new Error('offline') });
    mockLocalGet.mockResolvedValue([]);

    const { byDog, serverError } = await loadDogRegistrations(['dog-1']);
    expect(serverError).toBeInstanceOf(Error);
    expect(byDog.size).toBe(0);
  });

  it('surfaces a THROWN network failure as serverError instead of rejecting', async () => {
    mockServerIn.mockRejectedValue(new Error('network down'));
    mockLocalGet.mockResolvedValue([]);

    const { serverError } = await loadDogRegistrations(['dog-1']);
    expect(serverError).toBeInstanceOf(Error);
  });
});
