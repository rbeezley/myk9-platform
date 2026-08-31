import { createDatabaseError } from '@/services/database/databaseError';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockServerIn, mockLocalGet, mockPeopleIn, mockReplicatedGetAllDogs, mockPostgrestAllDogs } =
  vi.hoisted(() => ({
    mockServerIn: vi.fn(),
    mockLocalGet: vi.fn(),
    mockPeopleIn: vi.fn(),
    mockReplicatedGetAllDogs: vi.fn(),
    mockPostgrestAllDogs: vi.fn(),
  }));

vi.mock('../../supabaseClient', () => ({
  supabase: {
    from: (table: string) =>
      table === 'dogs'
        ? { select: () => ({ is: () => ({ order: () => mockPostgrestAllDogs() }) }) }
        : { select: () => ({ in: table === 'people' ? mockPeopleIn : mockServerIn }) },
  },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedDogRegistrationsTable', () => ({
  replicatedDogRegistrationsTable: { getRegistrationsForDogs: mockLocalGet },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAllDogs: mockReplicatedGetAllDogs },
}));

import { getAllDogs, loadDogRegistrations } from '../reads';
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

  // The UUIDs sort opposite to the order the exhibitor entered the rows. This
  // fixture keeps equal server timestamps so the local mirror is the only
  // source of creation order for this test.
  const serverRowsWithTiedTimestamps = [
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

  const serverRowsWithCreationOrder = [
    {
      ...serverRowsWithTiedTimestamps[0],
      created_at: '2025-06-01T11:59:59.000Z',
    },
    {
      ...serverRowsWithTiedTimestamps[1],
      created_at: '2025-06-01T11:59:58.000Z',
    },
  ];

  it('overlays the local creation order onto identical server timestamps', async () => {
    mockServerIn.mockResolvedValue({ data: serverRowsWithTiedTimestamps, error: null });
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

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);
    expect(resolveDogIdentity(byDog.get('dog-1')!).breed).toBe('Belgian Malinois');
    expect(registrationsReadComplete).toBe(true);
  });

  it('without a local mirror preserves the server creation order', async () => {
    mockServerIn.mockResolvedValue({ data: serverRowsWithCreationOrder, error: null });
    mockLocalGet.mockResolvedValue([]);

    const { byDog } = await loadDogRegistrations(['dog-1']);
    expect(resolveDogIdentity(byDog.get('dog-1')!).breed).toBe('Belgian Malinois');
  });

  it('marks partial rows as incomplete when the server also reports an error', async () => {
    mockServerIn.mockResolvedValue({
      data: [serverRowsWithCreationOrder[0]],
      error: new Error('partial read'),
    });
    mockLocalGet.mockResolvedValue([]);

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(byDog.get('dog-1')).toEqual([serverRowsWithCreationOrder[0]]);
    expect(registrationsReadComplete).toBe(false);
  });

  it('treats a successful empty server read as authoritative', async () => {
    mockServerIn.mockResolvedValue({ data: [], error: null });
    mockLocalGet.mockResolvedValue([]);

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(byDog.get('dog-1')).toBeUndefined();
    expect(registrationsReadComplete).toBe(true);
  });

  it('reports the server error so callers can refuse rather than assume absence', async () => {
    mockServerIn.mockResolvedValue({ data: null, error: new Error('offline') });
    mockLocalGet.mockResolvedValue([]);

    const { byDog, serverError, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);
    expect(serverError).toBeInstanceOf(Error);
    expect(byDog.size).toBe(0);
    expect(registrationsReadComplete).toBe(false);
  });

  it('retains local-only registrations when the server leg fails', async () => {
    const localRegistration = {
      id: 'local-akc',
      dog_id: 'dog-1',
      created_at: '2025-06-01T11:59:58.000Z',
      organization: 'AKC',
      registration_number: 'LOCAL-101',
      breed: 'All-American Dog',
    };
    mockServerIn.mockResolvedValue({ data: null, error: new Error('offline') });
    mockLocalGet.mockResolvedValue([localRegistration]);

    const { byDog, serverError, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(serverError).toBeInstanceOf(Error);
    expect(byDog.get('dog-1')).toEqual([localRegistration]);
    expect(registrationsReadComplete).toBe(false);
  });

  it('surfaces a THROWN network failure as serverError instead of rejecting', async () => {
    mockServerIn.mockRejectedValue(new Error('network down'));
    mockLocalGet.mockResolvedValue([]);

    const { serverError, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);
    expect(serverError).toBeInstanceOf(Error);
    expect(registrationsReadComplete).toBe(false);
  });

  it('marks the merged read incomplete when the local replica read fails', async () => {
    mockServerIn.mockResolvedValue({ data: [serverRowsWithCreationOrder[0]], error: null });
    mockLocalGet.mockRejectedValue(new Error('local replica unavailable'));

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(byDog.get('dog-1')).toEqual([serverRowsWithCreationOrder[0]]);
    expect(registrationsReadComplete).toBe(false);
  });
});

describe('getAllDogs registration completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReplicatedGetAllDogs.mockResolvedValue([
      {
        id: 'dog-1',
        name: 'Ziva',
        callName: 'Ziva',
        breed: '',
        ownerId: undefined,
      },
    ]);
    mockPeopleIn.mockResolvedValue({ data: [], error: null });
    mockLocalGet.mockResolvedValue([]);
    mockPostgrestAllDogs.mockResolvedValue({ data: [], error: null });
  });

  it('keeps replicated dogs visible and marks registration data incomplete after a failed read', async () => {
    mockServerIn.mockResolvedValue({ data: null, error: new Error('offline') });

    const result = await getAllDogs('person-1', true);

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.registrations).toEqual([]);
    expect(result.data?.[0]?.registrations_read_complete).toBe(false);
  });

  it('keeps partial query results visible but marks registrations incomplete', async () => {
    const partialRegistration = {
      id: 'reg-akc',
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'DN61191906',
      breed: 'Belgian Malinois',
    };
    mockServerIn.mockResolvedValue({
      data: [partialRegistration],
      error: new Error('partial read'),
    });

    const result = await getAllDogs('person-1', true);

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.registrations).toEqual([partialRegistration]);
    expect(result.data?.[0]?.registrations_read_complete).toBe(false);
  });

  it('keeps a successful empty registration read authoritative at the query boundary', async () => {
    mockServerIn.mockResolvedValue({ data: [], error: null });

    const result = await getAllDogs('person-1', true);

    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.registrations).toEqual([]);
    expect(result.data?.[0]?.registrations_read_complete).toBe(true);
  });

  it('preserves registrations when the PostgREST fallback supplies the dog list', async () => {
    const fallbackRegistration = {
      id: 'reg-akc',
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'DN61191906',
      breed: 'Belgian Malinois',
    };
    mockReplicatedGetAllDogs.mockRejectedValue(new Error('replica unavailable'));
    mockPostgrestAllDogs.mockResolvedValue({
      data: [
        {
          id: 'dog-1',
          name: 'Ziva',
          call_name: 'Ziva',
          owner_id: 'person-1',
          registrations: [fallbackRegistration],
        },
      ],
      error: null,
    });

    const result = await getAllDogs('person-1', true);

    expect(mockPostgrestAllDogs).toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.data?.[0]?.registrations).toEqual([fallbackRegistration]);
  });
});

/**
 * MYK9-272.
 *
 * A PostgREST `.in()` filter travels in the URL, so an unbounded id list
 * eventually produces a request the server rejects outright — and because the
 * rejection carries no CORS headers, the browser reports it as a CORS error,
 * naming the wrong cause entirely.
 *
 * It scales with data: small accounts never reach the limit, and a secretary
 * gathering dogs across every managed show sent 200+ ids and failed every
 * time. It also degrades quietly, since the caller catches the failure so the
 * local replica can still answer — the user sees registrations and only
 * `registrationsReadComplete` goes false.
 *
 * Asserting the CALL COUNT is the point. A test that only checked the merged
 * rows would pass with the batching removed, because the mock has no URL.
 */
describe('loadDogRegistrations batching', () => {
  beforeEach(() => vi.clearAllMocks());

  const ids = Array.from({ length: 250 }, (_, i) => `dog-${i}`);

  it('splits a large id list across several requests and merges every batch', async () => {
    mockLocalGet.mockResolvedValue([]);
    mockServerIn.mockImplementation((_column: string, batch: string[]) => ({
      data: batch.map(dogId => ({ id: `reg-${dogId}`, dog_id: dogId })),
      error: null,
    }));

    const result = await loadDogRegistrations(ids);

    // 250 ids at 100 per batch.
    expect(mockServerIn).toHaveBeenCalledTimes(3);

    // Every id is requested exactly once — no gaps, no repeats.
    const requested = mockServerIn.mock.calls.flatMap(call => call[1] as string[]);
    expect(requested).toEqual(ids);

    // And every batch's rows survive the merge.
    expect(result.byDog.size).toBe(250);
    expect(result.registrationsReadComplete).toBe(true);
  });

  it('keeps the batches that succeeded when a later one fails', async () => {
    // #1490 decided that a partial read stays VISIBLE and is reported as
    // incomplete, rather than being discarded. Batching must not quietly
    // reverse that: a first draft returned early on the failing batch and
    // broke two of this file's existing tests.
    mockLocalGet.mockResolvedValue([]);
    mockServerIn
      .mockReturnValueOnce({ data: [{ id: 'reg-1', dog_id: 'dog-0' }], error: null })
      .mockReturnValueOnce({ data: null, error: { message: 'boom' } })
      .mockReturnValueOnce({ data: [{ id: 'reg-2', dog_id: 'dog-200' }], error: null });

    const result = await loadDogRegistrations(ids);

    expect(result.serverError).toEqual({ message: 'boom' });
    expect(result.registrationsReadComplete).toBe(false);
    // The surviving batches are still here.
    expect(result.byDog.get('dog-0')).toHaveLength(1);
    expect(result.byDog.get('dog-200')).toHaveLength(1);
  });
});

