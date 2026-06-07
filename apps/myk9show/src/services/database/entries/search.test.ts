import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createDatabaseError: vi.fn((error: unknown, table?: string, operation?: string) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Object.assign(new Error(message), { name: 'DatabaseError', table, operation });
  }),
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  replicatedEntriesGetAll: vi.fn(),
  replicatedDogsGetAllDogs: vi.fn(),
  replicatedClassesGetAll: vi.fn(),
  replicatedShowsGetAllShows: vi.fn(),
  replicatedTrialsGetAll: vi.fn(),
  mapReplicatedEntryToDbRow: vi.fn(),
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
    getAll: mocks.replicatedEntriesGetAll,
  },
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: {
    getAllDogs: mocks.replicatedDogsGetAllDogs,
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: {
    getAll: mocks.replicatedClassesGetAll,
  },
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {
    getAllShows: mocks.replicatedShowsGetAllShows,
  },
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {
    getAll: mocks.replicatedTrialsGetAll,
  },
}));

vi.mock('@/services/mappers/entryMappers', () => ({
  mapReplicatedEntryToDbRow: mocks.mapReplicatedEntryToDbRow,
}));

import { USER_ENTRIES_SELECT, getUserEntries } from './search';
import { findMissingReplicatedUserEntryRelations } from './userEntriesReplication';

function makeDogQuery(data: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => Promise.resolve({ data, error: null })),
  };
  return query;
}

function makeEntriesQuery(data: Array<Record<string, unknown>>, error: Error | null = null) {
  const query = {
    select: vi.fn(() => query),
    or: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };
  return query;
}

function makeEnrollmentsQuery(data: Array<Record<string, unknown>>) {
  const query = {
    select: vi.fn(() => query),
    in: vi.fn(() => Promise.resolve({ data, error: null })),
  };
  return query;
}

function mockSupabaseTables(options: {
  dogRows?: Array<Record<string, unknown>>;
  entryRows?: Array<Record<string, unknown>>;
  entriesError?: Error | null;
  enrollmentRows?: Array<Record<string, unknown>>;
}) {
  const dogQuery = makeDogQuery(options.dogRows ?? []);
  const entriesQuery = makeEntriesQuery(options.entryRows ?? [], options.entriesError ?? null);
  const enrollmentsQuery = makeEnrollmentsQuery(options.enrollmentRows ?? []);

  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table === 'dogs') return dogQuery;
    if (table === 'entries') return entriesQuery;
    if (table === 'enrollments') return enrollmentsQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { dogQuery, entriesQuery, enrollmentsQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mapReplicatedEntryToDbRow.mockImplementation(
    (entry: Record<string, unknown>, options: Record<string, unknown>) => ({
      id: entry.id,
      class_id: entry.classId,
      dog_id: entry.dogId,
      show_id: entry.showId,
      registration_id: entry.registrationId,
      class: options.cls ?? null,
      dog: options.dog ?? null,
      show: options.show ?? null,
    })
  );
});

/**
 * The PostgREST fallback for getUserEntries must select every column the
 * MyEntries mapper (transformEntry) reads. A dropped column silently renders a
 * default on the fallback path — e.g. a missing check_in_status reads as
 * "Not Checked In" even after a persisted check-in (the regression this guards).
 */
describe('USER_ENTRIES_SELECT (getUserEntries PostgREST fallback shape)', () => {
  const requiredColumns = [
    'check_in_status',
    'entry_status',
    'payment_status',
    'entry_fee',
    'armband',
    'is_scored',
    'result_status',
    'search_time_seconds',
    'total_faults',
    'final_placement',
    'start_date',
    'end_date',
    'entry_close_date',
    'call_name',
    'confirmation_number',
    'class_number',
    'trial_type',
  ];

  it.each(requiredColumns)('selects "%s"', column => {
    expect(USER_ENTRIES_SELECT).toContain(column);
  });

  it('selects trial type through class_id for legacy rows with entries.trial_id null', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /class:class_id\s*\([^)]*trial:trial_id\s*\([^)]*trial_type/s
    );
  });

  it('selects enrollment payment status for secretary-recorded grouped payments', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /registration:registration_id\s*\([^)]*confirmation_number[^)]*payment_status/s
    );
  });
});

describe('findMissingReplicatedUserEntryRelations', () => {
  it('reports class/show/dog relation rows that have not hydrated yet', () => {
    const missing = findMissingReplicatedUserEntryRelations(
      [
        {
          id: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          showId: 'show-1',
        },
        {
          id: 'entry-2',
          classId: 'class-2',
          dogId: 'dog-2',
          showId: 'show-1',
        },
      ],
      {
        classesMap: new Map([['class-1', {}]]),
        dogsMap: new Map([['dog-1', {}]]),
        showsMap: new Map([['show-1', {}]]),
      }
    );

    expect(missing).toEqual(['class:class-2', 'dog:dog-2']);
  });

  it('returns no missing relations when every referenced row is available', () => {
    const missing = findMissingReplicatedUserEntryRelations(
      [
        {
          id: 'entry-1',
          classId: 'class-1',
          dogId: 'dog-1',
          showId: 'show-1',
        },
      ],
      {
        classesMap: new Map([['class-1', {}]]),
        dogsMap: new Map([['dog-1', {}]]),
        showsMap: new Map([['show-1', {}]]),
      }
    );

    expect(missing).toEqual([]);
  });
});

describe('getUserEntries replicated relation completeness', () => {
  const replicatedEntry = {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    showId: 'show-1',
    handlerId: 'user-1',
    registrationId: 'reg-1',
  };
  const replicatedDog = { id: 'dog-1', ownerId: 'user-1' };
  const replicatedClass = { id: 'class-1', trialId: 'trial-1' };
  const replicatedShow = { id: 'show-1' };
  const replicatedTrial = { id: 'trial-1', trialType: 'Scent Work' };

  function mockReplicatedStores(options: {
    classes?: Array<Record<string, unknown>>;
    entriesThrows?: boolean;
  } = {}) {
    if (options.entriesThrows) {
      mocks.replicatedEntriesGetAll.mockRejectedValue(new Error('replication unavailable'));
    } else {
      mocks.replicatedEntriesGetAll.mockResolvedValue([replicatedEntry]);
    }
    mocks.replicatedDogsGetAllDogs.mockResolvedValue([replicatedDog]);
    mocks.replicatedClassesGetAll.mockResolvedValue(options.classes ?? [replicatedClass]);
    mocks.replicatedShowsGetAllShows.mockResolvedValue([replicatedShow]);
    mocks.replicatedTrialsGetAll.mockResolvedValue([replicatedTrial]);
  }

  it('returns complete replicated rows without calling PostgREST when relations are hydrated', async () => {
    mockReplicatedStores();
    const { enrollmentsQuery } = mockSupabaseTables({
      enrollmentRows: [
        {
          id: 'reg-1',
          confirmation_number: 'MK9-1',
          payment_status: 'paid',
          payment_reference: null,
          paid_amount: 30,
        },
      ],
    });

    const result = await getUserEntries('user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'entry-1',
      class: replicatedClass,
      dog: replicatedDog,
      show: replicatedShow,
      registration: {
        id: 'reg-1',
        confirmation_number: 'MK9-1',
      },
    });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('enrollments');
    expect(enrollmentsQuery.in).toHaveBeenCalledWith('id', ['reg-1']);
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
  });

  it('prefers the complete PostgREST result when replicated relation rows are missing', async () => {
    mockReplicatedStores({ classes: [] });
    const onlineRows = [{ id: 'online-entry', class: { id: 'class-1', name: 'Container' } }];
    mockSupabaseTables({
      dogRows: [{ id: 'dog-1' }],
      entryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('enrollments');
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('returns partial replicated rows when relation rows are missing and PostgREST fails', async () => {
    mockReplicatedStores({ classes: [] });
    mockSupabaseTables({
      dogRows: [{ id: 'dog-1' }],
      entriesError: new Error('offline'),
      enrollmentRows: [],
    });

    const result = await getUserEntries('user-1');

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: 'entry-1',
      class: null,
      dog: replicatedDog,
      show: replicatedShow,
    });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('enrollments');
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries_partial',
      expect.any(Number)
    );
  });

  it('falls back to PostgREST when replicated entry loading throws', async () => {
    mockReplicatedStores({ entriesThrows: true });
    const onlineRows = [{ id: 'online-entry' }];
    mockSupabaseTables({
      dogRows: [{ id: 'dog-1' }],
      entryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('entries');
  });
});
