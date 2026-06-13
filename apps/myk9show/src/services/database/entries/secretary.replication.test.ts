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
  },
}));

import { bulkUpdateEntryStatus, updateEntryStatus } from './secretary';

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
