import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryStatus } from '@/types/entry-lifecycle';

const mocks = vi.hoisted(() => ({
  createDatabaseError: vi.fn((error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
  ),
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  updateSecretaryLifecycleStatus: vi.fn(),
  getEntryById: vi.fn(),
  getEntriesByShow: vi.fn(),
  getAllDogs: vi.fn(),
  getAllClasses: vi.fn(),
  getArmbandsByShow: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  createDatabaseError: mocks.createDatabaseError,
  logQuery: mocks.logQuery,
  supabase: {
    from: mocks.supabaseFrom,
  },
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: {
    updateSecretaryLifecycleStatus: mocks.updateSecretaryLifecycleStatus,
    getEntryById: mocks.getEntryById,
    getEntriesByShow: mocks.getEntriesByShow,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: mocks.getAllDogs,
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getAll: mocks.getAllClasses,
  },
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: {
    getByShow: mocks.getArmbandsByShow,
  },
}));

import { bulkUpdateEntryStatus, getEntriesForShow, updateEntryStatus } from './secretary';

function mockLegacyEntryUpdate() {
  const query = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => Promise.resolve({ data: { id: 'entry-1' }, error: null })),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: [{ id: 'entry-1' }, { id: 'entry-2' }], error: null })),
  };

  mocks.supabaseFrom.mockReturnValue(query);
  return query;
}

function mockMetadataLookups() {
  const makeQuery = (data: unknown[]) => {
    const query = {
      select: vi.fn(() => query),
      in: vi.fn(() => Promise.resolve({ data, error: null })),
    };
    return query;
  };

  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table === 'people') {
      return makeQuery([
        {
          id: 'owner-1',
          first_name: 'Avery',
          last_name: 'Owner',
          email: 'avery@example.com',
        },
        {
          id: 'handler-1',
          first_name: 'Harper',
          last_name: 'Handler',
          email: 'harper@example.com',
        },
      ]);
    }

    if (table === 'enrollments') {
      return makeQuery([
        {
          id: 'reg-1',
          confirmation_number: 'CONF-1',
          payment_status: 'paid',
          payment_reference: 'pi_123',
          total_amount: 4500,
          paid_amount: 4500,
          refund_amount: null,
          refund_notes: null,
          refunded_at: null,
        },
      ]);
    }

    return mockLegacyEntryUpdate();
  });
}

describe('secretary entry status replication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSecretaryLifecycleStatus.mockResolvedValue('mutation-1');
    mocks.getEntryById.mockImplementation((entryId: string) =>
      Promise.resolve({
        id: entryId,
        showId: 'show-1',
        classId: entryId === 'entry-2' ? 'class-2' : 'class-1',
      })
    );
    mockLegacyEntryUpdate();
  });

  it('updates secretary entry status through the replicated entries table', async () => {
    const result = await updateEntryStatus('entry-1', 'confirmed' as EntryStatus);

    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      {
        entryStatus: 'confirmed',
        entry_status: 'confirmed',
        status: 'confirmed',
      },
      undefined
    );
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(result).toEqual({
      data: {
        id: 'entry-1',
        show_id: 'show-1',
        class_id: 'class-1',
        mutationId: 'mutation-1',
      },
      error: null,
    });
  });

  it('queues scratched status with pulled check-in state and withdrawal reason', async () => {
    await updateEntryStatus('entry-1', 'scratched' as EntryStatus, 'Handler withdrew');

    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      {
        entryStatus: 'scratched',
        entry_status: 'scratched',
        status: 'scratched',
        checkInStatus: 'pulled',
        check_in_status: 'pulled',
        withdrawalReason: 'Handler withdrew',
        withdrawal_reason: 'Handler withdrew',
      },
      undefined
    );
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
  });

  it('passes loaded secretary entry fields as a seed for missing local replica rows', async () => {
    await updateEntryStatus('entry-1', 'confirmed' as EntryStatus, undefined, {
      showId: 'show-1',
      classId: 'class-1',
      dogId: 'dog-1',
      armband: '101',
      paymentStatus: 'paid',
    });

    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ entry_status: 'confirmed' }),
      {
        showId: 'show-1',
        classId: 'class-1',
        dogId: 'dog-1',
        armband: '101',
        paymentStatus: 'paid',
      }
    );
  });

  it('bulk-updates each entry status through replicated mutations', async () => {
    const result = await bulkUpdateEntryStatus(['entry-1', 'entry-2'], 'confirmed' as EntryStatus);

    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenCalledTimes(2);
    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenNthCalledWith(1, 'entry-1', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      status: 'confirmed',
    });
    expect(mocks.updateSecretaryLifecycleStatus).toHaveBeenNthCalledWith(2, 'entry-2', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      status: 'confirmed',
    });
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(result).toEqual({
      data: [
        { id: 'entry-1', show_id: 'show-1', class_id: 'class-1', mutationId: 'mutation-1' },
        { id: 'entry-2', show_id: 'show-1', class_id: 'class-2', mutationId: 'mutation-1' },
      ],
      error: null,
    });
  });

  it('returns the existing bulk error envelope when a replicated mutation fails', async () => {
    mocks.updateSecretaryLifecycleStatus.mockRejectedValueOnce(
      new Error('offline queue unavailable')
    );

    const result = await bulkUpdateEntryStatus(['entry-1', 'entry-2'], 'confirmed' as EntryStatus);

    expect(result.data).toEqual([]);
    expect(result.error).toEqual(expect.objectContaining({ message: 'offline queue unavailable' }));
  });
});

describe('secretary entry read replication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-2',
        showId: 'show-1',
        dogId: 'dog-2',
        classId: 'class-2',
        entryStatus: 'submitted',
        submittedAt: '2026-06-02T10:00:00.000Z',
        deletedAt: '2026-06-02T12:00:00.000Z',
      },
      {
        id: 'entry-1',
        showId: 'show-1',
        dogId: 'dog-1',
        classId: 'class-1',
        trialId: 'trial-1',
        handlerId: 'handler-1',
        handler: null,
        armband: undefined,
        entryStatus: 'confirmed',
        paymentStatus: 'paid',
        paymentMethod: 'online',
        entryFee: 45,
        checkInStatus: 'checked-in',
        jumpHeight: '12',
        runOrder: 7,
        specialRequests: 'Crate near ring',
        withdrawalReason: null,
        submittedAt: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T11:00:00.000Z',
        registrationId: 'reg-1',
      },
    ]);
    mocks.getAllDogs.mockResolvedValue([
      {
        id: 'dog-1',
        name: 'Beacon',
        callName: 'Bee',
        breed: 'Border Collie',
        ownerId: 'owner-1',
      },
    ]);
    mocks.getAllClasses.mockResolvedValue([
      {
        id: 'class-1',
        name: 'Excellent Standard',
        maxEntries: 50,
      },
    ]);
    mocks.getArmbandsByShow.mockResolvedValue([
      {
        id: 'armband-1',
        showId: 'show-1',
        entryId: 'entry-1',
        dogId: 'dog-1',
        armbandNumber: '101',
      },
    ]);
    mockMetadataLookups();
  });

  it('builds secretary entries from replicated entries, dogs, and classes without reading entries through PostgREST', async () => {
    const result = await getEntriesForShow('show-1');

    expect(mocks.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(mocks.getAllDogs).toHaveBeenCalled();
    expect(mocks.getAllClasses).toHaveBeenCalled();
    expect(mocks.getArmbandsByShow).toHaveBeenCalledWith('show-1');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'entry-1',
        dog_id: 'dog-1',
        class_id: 'class-1',
        show_id: 'show-1',
        trial_id: 'trial-1',
        handler_id: 'handler-1',
        armband: '101',
        payment_status: 'paid',
        entry_status: 'confirmed',
        entry_fee: 45,
        check_in_status: 'checked-in',
        jump_height: '12',
        run_order: 7,
        special_requests: 'Crate near ring',
        submitted_at: '2026-06-01T10:00:00.000Z',
        created_at: '2026-06-01T10:00:00.000Z',
        updated_at: '2026-06-01T11:00:00.000Z',
        registration_id: 'reg-1',
        registration: expect.objectContaining({
          id: 'reg-1',
          confirmation_number: 'CONF-1',
          payment_status: 'paid',
          payment_reference: 'pi_123',
        }),
        handler_person: {
          id: 'handler-1',
          first_name: 'Harper',
          last_name: 'Handler',
        },
        dog: {
          id: 'dog-1',
          name: 'Beacon',
          call_name: 'Bee',
          breed: 'Border Collie',
          owner: {
            id: 'owner-1',
            first_name: 'Avery',
            last_name: 'Owner',
            email: 'avery@example.com',
          },
        },
        class: {
          id: 'class-1',
          name: 'Excellent Standard',
          class_number: null,
          max_entries: 50,
        },
      }),
    ]);
  });

  it('keeps the replicated secretary table usable when online metadata is unavailable', async () => {
    mocks.supabaseFrom.mockImplementation(() => {
      throw new Error('offline');
    });

    const result = await getEntriesForShow('show-1');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'entry-1',
        registration: null,
        handler_person: null,
        dog: expect.objectContaining({
          owner: {
            id: 'owner-1',
            first_name: null,
            last_name: null,
            email: null,
          },
        }),
      })
    );
  });

  it('orders replicated secretary entries by created_at when it differs from submitted_at', async () => {
    mocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-later-created',
        showId: 'show-1',
        submittedAt: '2026-06-01T08:00:00.000Z',
        createdAt: '2026-06-01T11:00:00.000Z',
      },
      {
        id: 'entry-earlier-created',
        showId: 'show-1',
        submittedAt: '2026-06-01T09:00:00.000Z',
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ]);
    mocks.getAllDogs.mockResolvedValue([]);
    mocks.getAllClasses.mockResolvedValue([]);
    mocks.getArmbandsByShow.mockResolvedValue([]);

    const result = await getEntriesForShow('show-1');

    expect(result.data.map(entry => entry.id)).toEqual([
      'entry-earlier-created',
      'entry-later-created',
    ]);
  });

  it('uses entry-level dog display fields when dog replication is stale', async () => {
    mocks.getEntriesByShow.mockResolvedValue([
      {
        id: 'entry-with-denormalized-dog',
        showId: 'show-1',
        dogId: 'dog-missing',
        dogCallName: 'Scout',
        dogBreed: 'Beagle',
        submittedAt: '2026-06-01T10:00:00.000Z',
      },
    ]);
    mocks.getAllDogs.mockResolvedValue([]);
    mocks.getAllClasses.mockResolvedValue([]);
    mocks.getArmbandsByShow.mockResolvedValue([]);

    const result = await getEntriesForShow('show-1');

    expect(result.data[0]?.dog).toEqual({
      id: 'dog-missing',
      name: 'Scout',
      call_name: 'Scout',
      breed: 'Beagle',
      owner: null,
    });
  });
});
