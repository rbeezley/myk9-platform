import { createDatabaseError } from '@/services/database/databaseError';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  createDatabaseError,
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

import { USER_ENTRIES_SELECT, getUserEntries, searchEntries } from './search';
import { findMissingReplicatedUserEntryRelations } from './userEntriesReplication';

function makeViewEntriesQuery(data: Array<Record<string, unknown>>, error: Error | null = null) {
  const query = {
    select: vi.fn(() => query),
    is: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => Promise.resolve({ data, error })),
  };
  return query;
}

function makeSearchEntriesQuery(data: Array<Record<string, unknown>>, error: Error | null = null) {
  const query = {
    select: vi.fn(() => query),
    or: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve({ data, error })),
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
  viewEntryRows?: Array<Record<string, unknown>>;
  viewEntriesError?: Error | null;
  enrollmentRows?: Array<Record<string, unknown>>;
}) {
  const viewQuery = makeViewEntriesQuery(
    options.viewEntryRows ?? [],
    options.viewEntriesError ?? null
  );
  const enrollmentsQuery = makeEnrollmentsQuery(options.enrollmentRows ?? []);

  mocks.supabaseFrom.mockImplementation((table: string) => {
    if (table === 'view_authenticated_entry_results') return viewQuery;
    if (table === 'enrollments') return enrollmentsQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { viewQuery, enrollmentsQuery };
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
    // 4.C: cash/check "pay at show" vs online "Finish Payment" depends on this
    // reaching the client — pin it so a future select edit can't drop it.
    'payment_method',
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
    // The amount-due deadline decides "entries have closed" in the SHOW's
    // timezone, matching the server guard. Dropping this would silently fall
    // back to America/New_York and disagree with checkout at the boundary.
    'timezone',
  ];

  it.each(requiredColumns)('selects "%s"', column => {
    expect(USER_ENTRIES_SELECT).toContain(column);
  });

  it('selects trial type through class_id for legacy rows with entries.trial_id null', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /class:class_id\s*\([^)]*trial:trial_id\s*\([^)]*trial_type/s
    );
  });

  it("selects the show's full trial list for the primary-trial timezone", () => {
    // The amount-due deadline picks the PRIMARY trial's zone, which needs every
    // trial of the show — not just the one the entry is in.
    expect(USER_ENTRIES_SELECT).toMatch(
      /show:show_id\s*\([^)]*trials:trials\s*\([^)]*timezone/s
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
  const replicatedDog = {
    id: 'dog-1',
    ownerId: 'user-1',
    imageUrl: 'https://example.com/dogs/dog-1.jpg',
  };
  const replicatedClass = {
    id: 'class-1',
    trialId: 'trial-1',
    resultsReleasedAt: '2026-06-18T15:45:00.000Z',
  };
  const replicatedShow = { id: 'show-1' };
  const replicatedTrial = { id: 'trial-1', trialType: 'Scent Work' };

  function mockReplicatedStores(
    options: {
      entries?: Array<Record<string, unknown>>;
      classes?: Array<Record<string, unknown>>;
      entriesThrows?: boolean;
    } = {}
  ) {
    if (options.entriesThrows) {
      mocks.replicatedEntriesGetAll.mockRejectedValue(new Error('replication unavailable'));
    } else {
      mocks.replicatedEntriesGetAll.mockResolvedValue(options.entries ?? [replicatedEntry]);
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
      class_results_released_at: '2026-06-18T15:45:00.000Z',
      dog_image_url: 'https://example.com/dogs/dog-1.jpg',
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
    const { viewQuery } = mockSupabaseTables({
      viewEntryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(viewQuery.is).toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('enrollments');
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('prefers the online view when the local entry replica is empty on an account-level page', async () => {
    mockReplicatedStores({ entries: [] });
    const onlineRows = [{ id: 'online-entry', dog: { id: 'dog-1', call_name: 'Tera' } }];
    const { viewQuery } = mockSupabaseTables({
      viewEntryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(viewQuery.eq).toHaveBeenCalledWith('is_own_entry', true);
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('enrollments');
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('prefers the online view when account-scope local entries filter down to empty', async () => {
    mockReplicatedStores({
      entries: [
        {
          id: 'other-entry',
          classId: 'class-1',
          dogId: 'other-dog',
          showId: 'show-1',
          handlerId: 'other-user',
          registrationId: 'reg-1',
        },
      ],
    });
    const onlineRows = [{ id: 'online-entry', dog: { id: 'dog-1', call_name: 'Tera' } }];
    const { viewQuery } = mockSupabaseTables({
      viewEntryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(viewQuery.eq).toHaveBeenCalledWith('is_own_entry', true);
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('keeps an empty local result when the account-level online check fails offline', async () => {
    mockReplicatedStores({ entries: [] });
    mockSupabaseTables({
      viewEntriesError: new Error('Failed to fetch'),
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: [], error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('surfaces backend errors when an empty account-level replica cannot be verified', async () => {
    mockReplicatedStores({ entries: [] });
    mockSupabaseTables({
      viewEntriesError: new Error('RLS policy denied'),
    });

    const result = await getUserEntries('user-1');

    expect(result.data).toEqual([]);
    expect(result.error).toMatchObject({
      message: 'RLS policy denied',
      table: 'entries',
      operation: 'select_user_entries',
    });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
  });

  it('returns partial replicated rows when relation rows are missing and PostgREST fails', async () => {
    mockReplicatedStores({ classes: [] });
    mockSupabaseTables({
      viewEntriesError: new Error('offline'),
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
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
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
      viewEntryRows: onlineRows,
    });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
  });
});

describe('searchEntries PostgREST fallback', () => {
  it('uses the authenticated result view without raw entries select-star access', async () => {
    mocks.replicatedEntriesGetAll.mockRejectedValue(new Error('replication unavailable'));
    const searchQuery = makeSearchEntriesQuery([
      {
        id: 'entry-1',
        dog_id: 'dog-1',
        show_id: 'show-1',
        class_id: 'class-1',
        armband: '101',
        handler: 'Robin Handler',
        result_status: 'qualified',
        dog_name: 'Full Name',
        dog_call_name: 'Beacon',
        dog_breed: 'Border Collie',
        class_name: 'Novice Containers',
        show_name: 'June Trial',
        show_start_date: '2026-06-20',
      },
    ]);

    mocks.supabaseFrom.mockImplementation((table: string) => {
      if (table === 'view_authenticated_entry_results') return searchQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await searchEntries('101');

    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(searchQuery.select).toHaveBeenCalledWith(expect.stringContaining('result_status'));
    expect(searchQuery.select).not.toHaveBeenCalledWith('*');
    expect(result).toMatchObject({
      data: [
        {
          id: 'entry-1',
          result_status: 'qualified',
          dog: {
            id: 'dog-1',
            name: 'Full Name',
            call_name: 'Beacon',
            breed: 'Border Collie',
          },
          class: {
            id: 'class-1',
            name: 'Novice Containers',
          },
          show: {
            id: 'show-1',
            name: 'June Trial',
            start_date: '2026-06-20',
          },
        },
      ],
      error: null,
    });
  });
});
