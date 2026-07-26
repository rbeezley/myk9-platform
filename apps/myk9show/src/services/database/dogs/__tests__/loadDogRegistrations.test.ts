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
  createDatabaseError: (e: unknown) => e,
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
    mockServerIn.mockResolvedValue({ data: [serverRows[0]], error: new Error('partial read') });
    mockLocalGet.mockResolvedValue([]);

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(byDog.get('dog-1')).toEqual([serverRows[0]]);
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

  it('surfaces a THROWN network failure as serverError instead of rejecting', async () => {
    mockServerIn.mockRejectedValue(new Error('network down'));
    mockLocalGet.mockResolvedValue([]);

    const { serverError, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);
    expect(serverError).toBeInstanceOf(Error);
    expect(registrationsReadComplete).toBe(false);
  });

  it('marks the merged read incomplete when the local replica read fails', async () => {
    mockServerIn.mockResolvedValue({ data: [serverRows[0]], error: null });
    mockLocalGet.mockRejectedValue(new Error('local replica unavailable'));

    const { byDog, registrationsReadComplete } = await loadDogRegistrations(['dog-1']);

    expect(byDog.get('dog-1')).toEqual([serverRows[0]]);
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
