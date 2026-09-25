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
// The account-level read moved to its own module (MYK9-629 / MYK9-563 item
// 7). Its tests stay here because they share this file's replication and
// PostgREST scaffolding with `searchEntries`.
import { USER_ENTRIES_SELECT, getUserEntries } from './userEntriesRead';

function makeViewEntriesQuery(
  data: Array<Record<string, unknown>>,
  error: Error | null = null,
  pages?: Array<Array<Record<string, unknown>>>
) {
  let selectedData = data;
  let pageIndex = 0;
  const query = {
    // Typed with its argument so a test can assert WHICH columns were asked for
    // (the optional migration-backed columns), not merely that a select
    // happened.
    select: vi.fn((_columns: string) => query),
    is: vi.fn(() => query),
    eq: vi.fn(() => query),
    lte: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    abortSignal: vi.fn(() => query),
    range: vi.fn((from: number) => {
      if (pages)
        selectedData = pages[pages.length > 1 ? pageIndex++ : Math.floor(from / 1000)] ?? [];
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
    'moved_from_entry_id',
    // MYK9-632 / MYK9-654: the withdrawal reason code is a required column now
    // that 20260918041700 is applied; its retry arm is gone.
    'withdrawal_reason_code',
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

  // Asserted as a positioned regex, not a bare `toContain('status')` — the
  // select already carries entry_status/payment_status, so a substring check
  // would pass with the show embed's own status dropped.
  it("selects the show's status so a cancelled future show is not offered at ringside", () => {
    expect(USER_ENTRIES_SELECT).toMatch(/show:show_id\s*\([^)]*\bstatus\b/s);
  });

  it("selects the show's full trial list for the primary-trial timezone", () => {
    // The amount-due deadline picks the PRIMARY trial's zone, which needs every
    // trial of the show — not just the one the entry is in.
    expect(USER_ENTRIES_SELECT).toMatch(/show:show_id\s*\([^)]*trials:trials\s*\([^)]*timezone/s);
  });

  it('selects enrollment payment status for secretary-recorded grouped payments', () => {
    expect(USER_ENTRIES_SELECT).toMatch(
      /registration:registration_id\s*\([^)]*confirmation_number[^)]*payment_status/s
    );
  });
});

/**
 * MYK9-536: `/my-entries` is a CROSS-SHOW route, and the entries replication
 * store only ever syncs with a show scope — so on that route it never syncs at
 * all. Trusting the snapshot because it merely LOOKED complete dropped a class
 * added to an already-synced enrollment from My Entries, its Edit Entry dialog
 * and the dashboard balance, while `/shows/:showId` (which does carry a show
 * scope) listed both. The account-level read must therefore prefer the
 * authoritative view and keep the replica strictly as an offline fallback.
 */
describe('getUserEntries account-scope read', () => {
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

  /**
   * MYK9-654: `withdrawal_reason_code` is required. Migration 20260918041700 is
   * applied, so the read names the column on every select and a 42703 naming
   * it is NOT retried without it: the retry arm, its second select string and
   * its warning are gone.
   */
  describe('withdrawal_reason_code (MYK9-632, MYK9-654) — required, never retried', () => {
    it('names the column in the select', async () => {
      mockReplicatedStores();
      const { viewQuery } = mockSupabaseTables({ viewEntryRows: [{ id: 'entry-1' }] });

      await getUserEntries('user-1');

      expect(viewQuery.select).toHaveBeenCalledWith(
        expect.stringContaining('withdrawal_reason_code')
      );
    });

    it('has no retry branch: a schema error naming it is not re-asked without it', async () => {
      mockReplicatedStores();
      const schemaError = Object.assign(
        new Error('column view_authenticated_entry_results.withdrawal_reason_code does not exist'),
        { code: '42703' }
      );
      const viewQuery = makeViewEntriesQuery([], schemaError);
      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === 'view_authenticated_entry_results') return viewQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const result = await getUserEntries('user-1');

      const selects = viewQuery.select.mock.calls.map(call => call[0]);
      expect(selects).toHaveLength(1);
      expect(selects[0]).toContain('withdrawal_reason_code');
      // The failed view read goes down the ordinary replica path, unconfirmed.
      expect(result.source).not.toBe('confirmed');
      expect(mocks.loggerWarn).not.toHaveBeenCalledWith(
        expect.stringContaining('20260918041700'),
        expect.anything(),
        expect.anything()
      );
    });
  });

  /**
   * MYK9-659: the ONE rule for the order reference is the view's
   * `can_view_admin`, so the online read must take the identifier from the
   * view COLUMN — not from the `registration:registration_id(...)` embed,
   * which PostgREST resolves under `enrollments_select` and therefore answers
   * a different question (the order's handler, not the entry's).
   */
  describe('registration_confirmation_number (MYK9-659) — asked for, preferred, and optional', () => {
    const schemaError = Object.assign(
      new Error(
        'column view_authenticated_entry_results.registration_confirmation_number does not exist'
      ),
      { code: '42703' }
    );

    it('names the column in the select', async () => {
      mockReplicatedStores();
      const { viewQuery } = mockSupabaseTables({ viewEntryRows: [{ id: 'entry-1' }] });

      await getUserEntries('user-1');

      expect(viewQuery.select).toHaveBeenCalledWith(
        expect.stringContaining('registration_confirmation_number')
      );
    });

    it('lets the view column override the embed on the rows it returns', async () => {
      mockReplicatedStores();
      const { viewQuery } = mockSupabaseTables({
        viewEntryRows: [
          {
            id: 'entry-1',
            registration_id: 'enrollment-1',
            registration_confirmation_number: 'MK9-000146',
            registration: { id: 'enrollment-1', payment_status: 'paid' },
          },
        ],
      });
      expect(viewQuery).toBeDefined();

      const result = await getUserEntries('user-1');

      expect(result.source).toBe('confirmed');
      expect(result.data[0]!.registration).toEqual({
        id: 'enrollment-1',
        payment_status: 'paid',
        confirmation_number: 'MK9-000146',
      });
    });

    it('drops the column and re-asks when the view has not got it yet', async () => {
      mockReplicatedStores();
      const rows = [{ id: 'entry-1' }];
      const viewQuery = makeViewEntriesQuery(rows);
      viewQuery.range.mockImplementation(() =>
        Promise.resolve(
          viewQuery.select.mock.calls.at(-1)?.[0]?.includes('registration_confirmation_number')
            ? { data: [] as Array<Record<string, unknown>>, error: schemaError }
            : { data: rows, error: null }
        )
      );
      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === 'view_authenticated_entry_results') return viewQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const result = await getUserEntries('user-1');

      // The page survives the pre-push window; only the identifier degrades,
      // back to the embed's confirmation number.
      expect(result.source).toBe('confirmed');
      expect(result.data).toEqual(rows);
      const selects = viewQuery.select.mock.calls.map(call => call[0]);
      expect(selects[0]).toContain('registration_confirmation_number');
      expect(selects.at(-1)).not.toContain('registration_confirmation_number');
      // ...and the required reason code is not taken down with it.
      expect(selects.at(-1)).toContain('withdrawal_reason_code');
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('20260918193700'),
        'database',
        expect.objectContaining({ column: 'registration_confirmation_number' })
      );
    });
  });

  describe('moved_from_entry_id (MYK9-639) — asked for, and optional', () => {
    const schemaError = Object.assign(
      new Error('column view_authenticated_entry_results.moved_from_entry_id does not exist'),
      { code: '42703' }
    );

    it('drops the column and re-asks when the view has not got it yet', async () => {
      mockReplicatedStores();
      const rows = [{ id: 'entry-1' }];
      const viewQuery = makeViewEntriesQuery(rows);
      viewQuery.range.mockImplementation(() =>
        Promise.resolve(
          viewQuery.select.mock.calls.at(-1)?.[0]?.includes('moved_from_entry_id')
            ? { data: [] as Array<Record<string, unknown>>, error: schemaError }
            : { data: rows, error: null }
        )
      );
      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === 'view_authenticated_entry_results') return viewQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const result = await getUserEntries('user-1');

      expect(result.source).toBe('confirmed-move-up-link-unavailable');
      expect(result.data).toEqual(rows);
      const selects = viewQuery.select.mock.calls.map(call => call[0]);
      expect(selects[0]).toContain('moved_from_entry_id');
      expect(selects.at(-1)).not.toContain('moved_from_entry_id');
      expect(mocks.loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('20260918193300'),
        'database',
        expect.objectContaining({ column: 'moved_from_entry_id' })
      );
    });
  });

  it('reads the authoritative view even when the local replica looks fully hydrated', async () => {
    mockReplicatedStores();
    const onlineRows = [{ id: 'entry-1' }, { id: 'entry-2' }];
    const { viewQuery } = mockSupabaseTables({ viewEntryRows: onlineRows });

    const result = await getUserEntries('user-1');

    expect(result).toEqual({ data: onlineRows, error: null, source: 'confirmed' });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(viewQuery.eq).toHaveBeenCalledWith('is_own_entry', true);
    // The authenticated view retains the caller's own tombstoned entries so My
    // Entries can reconcile them with My Payments; the view itself enforces
    // owner-only deleted-row visibility.
    expect(viewQuery.is).not.toHaveBeenCalledWith('deleted_at', null);
    expect(mocks.mapReplicatedEntryToDbRow).not.toHaveBeenCalled();
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('enrollments');
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries',
      expect.any(Number)
    );
  });

  // The reported repro: the secretary marked the enrollment paid, the exhibitor
  // then added a second class by check. Only the first entry was ever in the
  // local snapshot, and every one of its relations resolved — the exact shape
  // that used to short-circuit the online read.
  it('returns the class added after the local snapshot last covered that show', async () => {
    mockReplicatedStores();
    const onlineRows = [
      {
        id: 'entry-1',
        registration_id: 'reg-1',
        payment_status: 'paid_by_cash',
        entry_fee: 30,
        class: { id: 'class-1', name: 'Interior Advanced' },
      },
      {
        id: 'entry-2',
        registration_id: 'reg-1',
        payment_status: 'pending',
        payment_method: 'check',
        entry_fee: 30,
        class: { id: 'class-2', name: 'Vehicle Advanced' },
      },
    ];
    mockSupabaseTables({ viewEntryRows: onlineRows });

    const result = await getUserEntries('user-1');

    expect(result.error).toBeNull();
    expect(result.data.map(row => row.id)).toEqual(['entry-1', 'entry-2']);
    // Nothing more is asserted about the row CONTENTS here: this read passes
    // the view's rows through untouched, so restating them would only prove the
    // stub was written correctly. What this read owns is WHICH rows arrive —
    // and the add-on arriving at all is what was broken. The content-level
    // guarantees (per-class effective status, the balance) belong to the
    // fixture tests in `pages/MyEntriesPage/modules/paidEnrollmentAddOn.test.tsx`.
  });

  // An empty view may CONFIRM an empty replica; it may not CONTRADICT a full
  // one. The view resolves ownership from `auth.uid()` in SQL while the replica
  // filter uses the client's personId + owned dog ids, and `people.id` is never
  // `auth.uid()` here — so an identity-resolution mismatch arrives as a
  // successful-but-empty read, and "you have no entries / $0 due" is a positive
  // claim this function may not make over a populated snapshot.
  it('keeps populated replica rows when the view returns successfully but EMPTY', async () => {
    mockReplicatedStores();
    mockSupabaseTables({
      viewEntryRows: [],
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

    expect(result.error).toBeNull();
    expect(result.data.map(row => row.id)).toEqual(['entry-1']);
    // Kept, but NOT confirmed. The server was reachable and declined to
    // return these rows, which is `replica-after-error`, not `replica-offline`.
    expect(result.source).toBe('replica-after-error');
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('the authoritative view did not return'),
      'database',
      expect.objectContaining({ rows: 1 })
    );
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries_empty_view_replica_kept',
      expect.any(Number)
    );
  });

  // A timed-out enrollment enrichment is its own reason to distrust the
  // figures, not just a missing confirmation number: with no order
  // payment_status, resolveEffectivePaymentStatus falls to "the entry row
  // stands", so a pending order over a paid-looking row under-claims the
  // amount due. The result must say so.
  it('reports a replica source when the enrollment enrichment times out', async () => {
    vi.useFakeTimers();
    try {
      mockReplicatedStores();
      const hangingEnrollments = {
        select: vi.fn(() => hangingEnrollments),
        in: vi.fn(() => hangingEnrollments),
        abortSignal: vi.fn(() => new Promise(() => {})),
      };
      const viewQuery = {
        select: vi.fn(() => viewQuery),
        is: vi.fn(() => viewQuery),
        eq: vi.fn(() => viewQuery),
        order: vi.fn(() => viewQuery),
        abortSignal: vi.fn(() => viewQuery),
        range: vi.fn(() => Promise.resolve({ data: [], error: null })),
      };
      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === 'view_authenticated_entry_results') return viewQuery;
        if (table === 'enrollments') return hangingEnrollments;
        throw new Error(`Unexpected table: ${table}`);
      });

      const pending = getUserEntries('user-1');
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
      const result = await pending;

      expect(result.data.map(row => row.id)).toEqual(['entry-1']);
      // The enrichment's own failure needs no second flag: this read is
      // already on the replica, and the source alone withholds every figure
      // the missing `payment_status` could have skewed (MYK9-629).
      expect(result.source).toBe('replica-after-error');
    } finally {
      vi.useRealTimers();
    }
  });

  // One deadline for the WHOLE paged read, not one per page: a per-page signal
  // would let each subsequent page start a fresh 15s of its own and keep
  // fetching pages nobody awaits after withTimeout has already won.
  it('shares one abort signal across every page of the view read', async () => {
    mockReplicatedStores();
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `entry-${index}`,
      created_at: `2026-06-05T12:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
    }));
    const { viewQuery } = mockSupabaseTables({
      viewEntryPages: [firstPage, [{ id: 'entry-1000', created_at: '2026-06-05T12:16:40.000Z' }]],
    });

    await getUserEntries('user-1');

    expect(viewQuery.abortSignal).toHaveBeenCalledTimes(2);
    const calls = viewQuery.abortSignal.mock.calls as unknown as Array<[AbortSignal]>;
    expect(calls[0][0]).toBeInstanceOf(AbortSignal);
    // The SAME instance, not merely another signal: a fresh per-page timeout
    // would restart the clock on every page.
    expect(calls[1][0]).toBe(calls[0][0]);
  });

  it('falls back to the replica when the view read never settles', async () => {
    vi.useFakeTimers();
    try {
      mockReplicatedStores();
      const hangingQuery = {
        select: vi.fn(() => hangingQuery),
        is: vi.fn(() => hangingQuery),
        eq: vi.fn(() => hangingQuery),
        order: vi.fn(() => hangingQuery),
        range: vi.fn(() => new Promise(() => {})),
      };
      // The offline path's own network call, on the SAME dead network — it has
      // to hang too, or the test cannot see whether getUserEntries settles.
      const enrollmentsQuery = {
        select: vi.fn(() => enrollmentsQuery),
        in: vi.fn(() => enrollmentsQuery),
        abortSignal: vi.fn(() => new Promise(() => {})),
      };
      mocks.supabaseFrom.mockImplementation((table: string) => {
        if (table === 'view_authenticated_entry_results') return hangingQuery;
        if (table === 'enrollments') return enrollmentsQuery;
        throw new Error(`Unexpected table: ${table}`);
      });

      const pending = getUserEntries('user-1');
      // Two deadlines in series: the view's, then the enrollment enrichment's.
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS + 1);
      const result = await pending;

      expect(result.error).toBeNull();
      expect(result.data.map(row => row.id)).toEqual(['entry-1']);
      expect(mocks.logQuery).toHaveBeenCalledWith(
        'entries',
        'select_user_entries_stale_replica_after_error',
        expect.any(Number)
      );
      // A hang is not provably offline — a captive portal keeps
      // `navigator.onLine` true — so it warns like any other non-offline reason
      // to hand an account-level page a per-show snapshot.
      expect(mocks.loggerWarn).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fetches every page when the account has more than PostgREST's 1000-row cap", async () => {
    mockReplicatedStores();
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `entry-${index}`,
      created_at: `2026-06-05T12:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
    }));
    const secondPage = Array.from({ length: 231 }, (_, index) => ({
      id: `entry-${1000 + index}`,
      created_at: `2026-06-05T12:16:${String(index).padStart(2, '0')}.000Z`,
    }));
    const { viewQuery } = mockSupabaseTables({
      viewEntryPages: [firstPage, secondPage],
    });

    const result = await getUserEntries('user-1');

    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1231);
    expect(result.data.map(entry => entry.id)).toEqual([
      ...firstPage.map(entry => entry.id),
      ...secondPage.map(entry => entry.id),
    ]);
    expect(viewQuery.range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(viewQuery.range).toHaveBeenNthCalledWith(2, 0, 999);
  });

  it('keeps an empty local result when the account-level online read fails offline', async () => {
    mockReplicatedStores({ entries: [] });
    mockSupabaseTables({
      viewEntriesError: new Error('Failed to fetch'),
    });

    const result = await getUserEntries('user-1');

    expect(result.data).toEqual([]);
    expect(result.error).toBeNull();
    // Empty AND unconfirmed. Offline with nothing cached we do not know that
    // the account owes nothing — we know we could not ask. The source keeps a
    // money surface from reading this absence as "paid in full".
    expect(result.source).toBe('replica-offline');
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

  it('falls back to replicated rows, without alarm, when the device is offline', async () => {
    mockReplicatedStores();
    mockSupabaseTables({
      viewEntriesError: new Error('Failed to fetch'),
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
      registration: { id: 'reg-1', confirmation_number: 'MK9-1' },
    });
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('view_authenticated_entry_results');
    expect(mocks.supabaseFrom).toHaveBeenCalledWith('enrollments');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('entries');
    expect(mocks.supabaseFrom).not.toHaveBeenCalledWith('dogs');
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries_partial',
      expect.any(Number)
    );
    // Offline is the EXPECTED reason to be here; it must not cry wolf.
    expect(mocks.loggerWarn).not.toHaveBeenCalled();
  });

  // Offline is the expected reason to be on the replica and needs no alarm. A
  // 403, a 500 or an RLS denial is NOT: the exhibitor is handed a per-show
  // snapshot that may be missing exactly the rows MYK9-536 was about, with
  // `error: null` on the result. Silence there makes the original symptom
  // reachable again on a transient server error with nothing in the logs to say
  // so, which is why this path warns and carries its own query label.
  it('warns and labels the read when a NON-offline view error serves the replica', async () => {
    mockReplicatedStores();
    mockSupabaseTables({
      viewEntriesError: new Error('RLS policy denied'),
      enrollmentRows: [],
    });

    const result = await getUserEntries('user-1');

    expect(result.data.map(row => row.id)).toEqual(['entry-1']);
    expect(result.error).toBeNull();
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('possibly-stale replica'),
      'database',
      expect.objectContaining({ rows: 1, error: 'RLS policy denied' })
    );
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries_stale_replica_after_error',
      expect.any(Number)
    );
    expect(result.source).toBe('replica-after-error');
  });

  it('surfaces the online error when the replica is also unreadable', async () => {
    mockReplicatedStores({ entriesThrows: true });
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
    expect(mocks.logQuery).toHaveBeenCalledWith(
      'entries',
      'select_user_entries_replica_unreadable',
      expect.any(Number),
      'RLS policy denied'
    );
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
