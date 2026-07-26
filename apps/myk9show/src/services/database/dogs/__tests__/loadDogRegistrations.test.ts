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
 * `create_dog_with_registrations` inserts every registration in one transaction
 * WITHOUT `created_at`, so PostgreSQL stamps them identically and the resolver's
 * comparator ties — falling through to a random server UUID. The local mirror
 * holds the true creation ORDER, so the merge overlays it onto the matching
 * server rows.
 */
describe('loadDogRegistrations', () => {
  beforeEach(() => vi.clearAllMocks());

  // Both rows share a server timestamp (same transaction) and the UUIDs sort
  // opposite to the order the exhibitor entered them.
  const serverRows = [
    {
      id: 'aaaaaaaa-0000-4000-8000-000000000000',
      dog_id: 'dog-1',
      created_at: '2025-06-01T12:00:00.000Z',
      organization: 'UKC',
      registration_number: 'P935-254',
      breed: 'Belgian Shepherd Dog',
    },
    {
      id: 'zzzzzzzz-0000-4000-8000-000000000000',
      dog_id: 'dog-1',
      created_at: '2025-06-01T12:00:00.000Z',
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

  it('without a local mirror the tie falls to server UUID order (known gap)', async () => {
    // Documents the residual cross-device gap: another device has no local
    // mirror, so ordering depends on the server UUID until
    // `create_dog_with_registrations` inserts `created_at` (a migration, out of
    // scope for task 2.3).
    mockServerIn.mockResolvedValue({ data: serverRows, error: null });
    mockLocalGet.mockResolvedValue([]);

    const { byDog } = await loadDogRegistrations(['dog-1']);
    expect(resolveDogIdentity(byDog.get('dog-1')!).breed).toBe('Belgian Shepherd Dog');
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
