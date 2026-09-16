import { createDatabaseError } from '@/services/database/databaseError';
import { DEFAULT_TIMEOUT_MS } from '@myk9/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  logQuery: vi.fn(),
  supabaseFrom: vi.fn(),
  replicatedEntriesGetAll: vi.fn(),
  replicatedDogsGetAllDogs: vi.fn(),
  replicatedClassesGetAll: vi.fn(),
  replicatedShowsGetAllShows: vi.fn(),
  replicatedTrialsGetAll: vi.fn(),
  mapReplicatedEntryToDbRow: vi.fn(),
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: vi.fn(),
    log: vi.fn(),
  },
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

import { isEntryCloseDayPast, searchEntries } from './search';

function makeViewEntriesQuery(
  data: Array<Record<string, unknown>>,
  error: Error | null = null,
  pages?: Array<Array<Record<string, unknown>>>
) {
  let selectedData = data;
  const query = {
    select: vi.fn(() => query),
    is: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    range: vi.fn((from: number) => {
      if (pages) selectedData = pages[Math.floor(from / 1000)] ?? [];
      return Promise.resolve({ data: selectedData, error });
    }),
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
    in: vi.fn(() => query),
    abortSignal: vi.fn(() => Promise.resolve({ data, error: null })),
  };
  return query;
}

function mockSupabaseTables(options: {
  viewEntryRows?: Array<Record<string, unknown>>;
  viewEntryPages?: Array<Array<Record<string, unknown>>>;
  viewEntriesError?: Error | null;
  enrollmentRows?: Array<Record<string, unknown>>;
}) {
  const viewQuery = makeViewEntriesQuery(
    options.viewEntryRows ?? [],
    options.viewEntriesError ?? null,
    options.viewEntryPages
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

describe('isEntryCloseDayPast', () => {
  // `now` is pinned to an explicit UTC instant, never a bare local-time
  // literal. `isEntryCloseDayPast` defaults to America/New_York, so
  // `new Date('2026-09-03T00:01:00')` only lands on the day AFTER the close
  // day when the runner's own zone is west of UTC: it passed on a CDT laptop
  // and failed in CI, which runs UTC (2026-09-03T00:01Z is still 09-02 20:01
  // in New York). The comment on each line gives the New York wall clock the
  // assertion is actually about.
  it('keeps an entry editable throughout the stored close day', () => {
    // 2026-09-02 18:00 in New York — still the close day.
    expect(isEntryCloseDayPast('2026-09-02T00:00:00+00:00', new Date('2026-09-02T22:00:00Z'))).toBe(
      false
    );
  });

  it('blocks editing on the day after the stored close day', () => {
    // 2026-09-03 00:01 in New York — one minute into the next day.
    expect(isEntryCloseDayPast('2026-09-02T00:00:00+00:00', new Date('2026-09-03T04:01:00Z'))).toBe(
      true
    );
  });

  it("uses the show's timezone at the midnight boundary", () => {
    const justAfterMidnightUtc = new Date('2026-09-03T04:30:00Z');

    expect(
      isEntryCloseDayPast('2026-09-02T00:00:00+00:00', justAfterMidnightUtc, 'America/Los_Angeles')
    ).toBe(false);
    expect(
      isEntryCloseDayPast('2026-09-02T00:00:00+00:00', justAfterMidnightUtc, 'America/New_York')
    ).toBe(true);
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
