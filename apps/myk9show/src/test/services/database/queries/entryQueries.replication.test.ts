import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedShow } from '@/services/replication/ReplicatedShowsTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockEntriesTable, mockDogsTable, mockClassesTable, mockShowsTable, mockTrialsTable } =
  vi.hoisted(() => ({
    mockEntriesTable: {
      getAll: vi.fn(),
      getEntriesByShow: vi.fn(),
      getEntriesByClass: vi.fn(),
      getEntryById: vi.fn(),
    },
    mockDogsTable: {
      getAllDogs: vi.fn(),
      getDogById: vi.fn(),
      getAll: vi.fn(),
    },
    mockClassesTable: {
      getAll: vi.fn(),
      getClassById: vi.fn(),
      getClassesByTrial: vi.fn(),
    },
    mockShowsTable: {
      getAllShows: vi.fn(),
      getShowById: vi.fn(),
      getAll: vi.fn(),
    },
    mockTrialsTable: {
      getTrialsByShow: vi.fn(),
      getAll: vi.fn(),
    },
  }));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));

vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: mockShowsTable,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

// Mock supabase client (for fetchMissingArmbands and promo_codes fallback)
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({
          in: () => Promise.resolve({ data: [], error: null }),
        }),
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    return { message: msg, code: 'UNKNOWN' };
  }),
}));

// Now import the functions under test
import {
  getAllEntries,
  getEntryById,
  getEntriesByShow,
  getEntriesByShowForFinancials,
  getEntriesByTrial,
  getEntriesByClass,
  getEntriesByDog,
  getEntriesByStatus,
  getEntryStatistics,
  getUserEntries,
  searchEntries,
  canModifyEntry,
} from '@/services/database/entries';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    dogId: 'dog-1',
    handlerId: 'handler-1',
    armband: '101',
    handler: 'Jane Smith',
    entryStatus: 'confirmed',
    jumpHeight: '20"',
    entryFee: 30,
    paymentStatus: 'paid',
    runOrder: 1,
    specialRequests: null,
    submittedAt: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Max Registered Name',
    callName: 'Max',
    breed: 'Golden Retriever',
    ownerId: 'owner-1',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Novice A',
    entryFee: 30,
    maxEntries: 50,
    ...overrides,
  };
}

function makeShow(overrides: Partial<ReplicatedShow> = {}): ReplicatedShow {
  return {
    id: 'show-1',
    name: 'Spring Championship',
    organization: 'AKC',
    startDate: '2026-05-01',
    endDate: '2026-05-02',
    location: 'Portland, OR',
    status: 'published',
    entryCloseDate: '2026-04-25',
    ...overrides,
  };
}

function makeTrial(overrides: Partial<ReplicatedTrial> = {}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial 1',
    date: '2026-05-01',
    trialNumber: '1',
    status: 'upcoming',
    trialType: 'Scent Work',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers to set up default mocks for list queries
// ---------------------------------------------------------------------------

function setupListMocks(
  entries: ReplicatedEntry[] = [makeEntry()],
  dogs: ReplicatedDog[] = [makeDog()],
  classes: ReplicatedClass[] = [makeClass()],
  shows: ReplicatedShow[] = [makeShow()],
  trials: ReplicatedTrial[] = [makeTrial()]
) {
  mockEntriesTable.getAll.mockResolvedValue(entries);
  mockEntriesTable.getEntriesByShow.mockResolvedValue(entries);
  mockEntriesTable.getEntriesByClass.mockResolvedValue(entries);
  mockDogsTable.getAllDogs.mockResolvedValue(dogs);
  mockDogsTable.getAll.mockResolvedValue(dogs);
  mockClassesTable.getAll.mockResolvedValue(classes);
  mockClassesTable.getClassesByTrial.mockResolvedValue(classes);
  mockShowsTable.getAllShows.mockResolvedValue(shows);
  mockShowsTable.getAll.mockResolvedValue(shows);
  mockTrialsTable.getTrialsByShow.mockResolvedValue(trials);
  mockTrialsTable.getAll.mockResolvedValue(trials);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('entryQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAllEntries
  // -----------------------------------------------------------------------
  describe('getAllEntries', () => {
    it('returns correct snake_case shape with joined data', async () => {
      setupListMocks();

      const result = await getAllEntries();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('entry-1');
      expect(row.class_id).toBe('class-1');
      expect(row.show_id).toBe('show-1');
      expect(row.dog_id).toBe('dog-1');
      expect(row.handler_id).toBe('handler-1');
      expect(row.armband).toBe('101');
      expect(row.entry_status).toBe('confirmed');
      expect(row.entry_fee).toBe(30);
      expect(row.payment_status).toBe('paid');
      expect(row.deleted_at).toBeNull();

      // Dog sub-object
      const dog = row.dog as Record<string, unknown>;
      expect(dog.id).toBe('dog-1');
      expect(dog.name).toBe('Max Registered Name');
      expect(dog.call_name).toBe('Max');
      expect(dog.breed).toBe('Golden Retriever');

      // Class sub-object
      const cls = row.class as Record<string, unknown>;
      expect(cls.id).toBe('class-1');
      expect(cls.name).toBe('Novice A');
      expect(cls.entry_fee).toBe(30);

      // Show sub-object
      const show = row.show as Record<string, unknown>;
      expect(show.id).toBe('show-1');
      expect(show.name).toBe('Spring Championship');
      expect(show.start_date).toBe('2026-05-01');
    });

    it('returns empty array when no entries exist', async () => {
      setupListMocks([], [], [], [], []);

      const result = await getAllEntries();

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('sets dog/class/show to null when IDs are missing', async () => {
      setupListMocks([makeEntry({ dogId: undefined, classId: undefined, showId: undefined })]);

      const result = await getAllEntries();
      const row = result.data[0] as Record<string, unknown>;
      expect(row.dog).toBeNull();
      expect(row.class).toBeNull();
      expect(row.show).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getEntryById
  // -----------------------------------------------------------------------
  describe('getEntryById', () => {
    it('returns correct snake_case shape with joined data', async () => {
      mockEntriesTable.getEntryById.mockResolvedValue(makeEntry());
      mockDogsTable.getDogById.mockResolvedValue(makeDog());
      mockClassesTable.getClassById.mockResolvedValue(makeClass());
      mockShowsTable.getShowById.mockResolvedValue(makeShow());

      const result = await getEntryById('entry-1');

      expect(result.error).toBeNull();
      const row = result.data as Record<string, unknown>;
      expect(row.id).toBe('entry-1');
      expect((row.dog as Record<string, unknown>).id).toBe('dog-1');
      expect((row.class as Record<string, unknown>).id).toBe('class-1');
      expect((row.show as Record<string, unknown>).id).toBe('show-1');
    });

    it('returns { data: null, error: null } for missing records', async () => {
      mockEntriesTable.getEntryById.mockResolvedValue(null);

      const result = await getEntryById('non-existent');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByShow
  // -----------------------------------------------------------------------
  describe('getEntriesByShow', () => {
    it('returns entries with dog and class joins', async () => {
      setupListMocks();

      const result = await getEntriesByShow('show-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      expect(row.dog).toBeDefined();
      expect(row.class).toBeDefined();
      // getEntriesByShow does NOT join show (it's implicit from the filter)
      expect(row.show).toBeUndefined();
    });

    it('returns empty array when no entries for show', async () => {
      mockEntriesTable.getEntriesByShow.mockResolvedValue([]);
      mockDogsTable.getAllDogs.mockResolvedValue([]);
      mockClassesTable.getAll.mockResolvedValue([]);

      const result = await getEntriesByShow('show-999');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByShowForFinancials
  // -----------------------------------------------------------------------
  describe('getEntriesByShowForFinancials', () => {
    it('returns entries with dog, class, and trial joins', async () => {
      setupListMocks();

      const result = await getEntriesByShowForFinancials('show-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      expect(row.dog).toBeDefined();
      expect(row.class).toBeDefined();
      // Trial should be attached via class's trialId
      expect(row.trial).toBeDefined();
      const trial = row.trial as Record<string, unknown>;
      expect(trial.id).toBe('trial-1');
      expect(trial.name).toBe('Trial 1');
    });

    it('sets promo_code to null when entry has no promo code', async () => {
      setupListMocks();

      const result = await getEntriesByShowForFinancials('show-1');

      const row = result.data[0] as Record<string, unknown>;
      expect(row.promo_code).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByTrial
  // -----------------------------------------------------------------------
  describe('getEntriesByTrial', () => {
    it('filters entries by trial classes (inner join behavior)', async () => {
      const entries = [
        makeEntry({ id: 'e1', classId: 'class-1' }),
        makeEntry({ id: 'e2', classId: 'class-other' }),
      ];
      const classes = [makeClass({ id: 'class-1', trialId: 'trial-1' })];
      setupListMocks(entries, [makeDog()], classes);
      mockClassesTable.getClassesByTrial.mockResolvedValue(classes);

      const result = await getEntriesByTrial('trial-1');

      expect(result.error).toBeNull();
      // Only entry with class-1 should be included (class-other is not in trial)
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('e1');
    });

    it('returns empty when no classes match trial', async () => {
      setupListMocks([makeEntry()]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([]);

      const result = await getEntriesByTrial('trial-999');

      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByClass
  // -----------------------------------------------------------------------
  describe('getEntriesByClass', () => {
    it('sorts by run_order ascending with nulls last', async () => {
      const entries = [
        makeEntry({ id: 'e-null', runOrder: undefined }),
        makeEntry({ id: 'e-3', runOrder: 3 }),
        makeEntry({ id: 'e-1', runOrder: 1 }),
      ];
      setupListMocks(entries);
      mockEntriesTable.getEntriesByClass.mockResolvedValue(entries);

      const result = await getEntriesByClass('class-1');

      expect(result.data).toHaveLength(3);
      expect((result.data[0] as Record<string, unknown>).id).toBe('e-1');
      expect((result.data[1] as Record<string, unknown>).id).toBe('e-3');
      expect((result.data[2] as Record<string, unknown>).id).toBe('e-null');
    });

    it('includes dog sub-object', async () => {
      setupListMocks();

      const result = await getEntriesByClass('class-1');

      const row = result.data[0] as Record<string, unknown>;
      expect(row.dog).toBeDefined();
      expect((row.dog as Record<string, unknown>).id).toBe('dog-1');
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByDog
  // -----------------------------------------------------------------------
  describe('getEntriesByDog', () => {
    it('filters entries by dogId and includes class/show', async () => {
      const entries = [
        makeEntry({ id: 'e1', dogId: 'dog-1' }),
        makeEntry({ id: 'e2', dogId: 'dog-other' }),
      ];
      setupListMocks(entries);

      const result = await getEntriesByDog('dog-1');

      expect(result.data).toHaveLength(1);
      const row = result.data[0] as Record<string, unknown>;
      expect(row.id).toBe('e1');
      expect(row.class).toBeDefined();
      expect(row.show).toBeDefined();
    });

    it('returns empty when dog has no entries', async () => {
      setupListMocks([]);

      const result = await getEntriesByDog('dog-999');

      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getEntriesByStatus
  // -----------------------------------------------------------------------
  describe('getEntriesByStatus', () => {
    it('filters by entryStatus', async () => {
      const entries = [
        makeEntry({ id: 'e-confirmed', entryStatus: 'confirmed' }),
        makeEntry({ id: 'e-draft', entryStatus: 'draft' }),
      ];
      setupListMocks(entries);

      const result = await getEntriesByStatus('confirmed');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('e-confirmed');
    });

    it('returns empty when no entries match status', async () => {
      setupListMocks([makeEntry({ entryStatus: 'confirmed' })]);

      const result = await getEntriesByStatus('cancelled');

      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // getEntryStatistics
  // -----------------------------------------------------------------------
  describe('getEntryStatistics', () => {
    it('calculates correct statistics', async () => {
      const entries = [
        makeEntry({ id: 'e1', entryStatus: 'confirmed', entryFee: 30, paymentStatus: 'paid' }),
        makeEntry({ id: 'e2', entryStatus: 'confirmed', entryFee: 25, paymentStatus: 'paid' }),
        makeEntry({ id: 'e3', entryStatus: 'completed', entryFee: 30, paymentStatus: 'paid' }),
        makeEntry({ id: 'e4', entryStatus: 'draft', entryFee: 30, paymentStatus: 'pending' }),
      ];
      mockEntriesTable.getAll.mockResolvedValue(entries);

      const result = await getEntryStatistics();

      expect(result.error).toBeNull();
      expect(result.data.totalEntries).toBe(4);
      expect(result.data.byStatus).toEqual({
        confirmed: 2,
        completed: 1,
        draft: 1,
      });
      expect(result.data.totalRevenue).toBe(115);
      expect(result.data.paidRevenue).toBe(85);
      // completionRate = completed(1) / paid(3) * 100
      expect(result.data.completionRate).toBeCloseTo(33.33, 1);
    });

    it('filters by showId when provided', async () => {
      const entries = [makeEntry({ showId: 'show-1', entryFee: 30 })];
      mockEntriesTable.getEntriesByShow.mockResolvedValue(entries);

      const result = await getEntryStatistics('show-1');

      expect(result.data.totalEntries).toBe(1);
      expect(mockEntriesTable.getEntriesByShow).toHaveBeenCalledWith('show-1');
    });

    it('returns zeros when no entries exist', async () => {
      mockEntriesTable.getAll.mockResolvedValue([]);

      const result = await getEntryStatistics();

      expect(result.data).toEqual({
        totalEntries: 0,
        byStatus: {},
        totalRevenue: 0,
        paidRevenue: 0,
        completionRate: 0,
      });
    });
  });

  // -----------------------------------------------------------------------
  // getUserEntries
  // -----------------------------------------------------------------------
  describe('getUserEntries', () => {
    it('filters by handlerId', async () => {
      const entries = [
        makeEntry({ id: 'e1', handlerId: 'user-1' }),
        makeEntry({ id: 'e2', handlerId: 'user-other' }),
      ];
      setupListMocks(entries);

      const result = await getUserEntries('user-1');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('e1');
    });

    it('returns empty when user has no entries', async () => {
      setupListMocks([]);

      const result = await getUserEntries('user-999');

      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // searchEntries
  // -----------------------------------------------------------------------
  describe('searchEntries', () => {
    it('searches by armband case-insensitively', async () => {
      const entries = [
        makeEntry({ id: 'match', armband: '101' }),
        makeEntry({ id: 'no-match', armband: '202' }),
      ];
      setupListMocks(entries);

      const result = await searchEntries('101');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('searches by handler name case-insensitively', async () => {
      const entries = [
        makeEntry({ id: 'match', handler: 'Jane Smith' }),
        makeEntry({ id: 'no-match', handler: 'Bob Jones' }),
      ];
      setupListMocks(entries);

      const result = await searchEntries('jane');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('limits results to 50', async () => {
      const entries = Array.from({ length: 60 }, (_, i) =>
        makeEntry({ id: `e-${i}`, armband: '100' })
      );
      setupListMocks(entries);

      const result = await searchEntries('100');

      expect(result.data).toHaveLength(50);
    });

    it('returns empty for no matches', async () => {
      setupListMocks([makeEntry()]);

      const result = await searchEntries('zzzznonexistent');

      expect(result.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // canModifyEntry
  // -----------------------------------------------------------------------
  describe('canModifyEntry', () => {
    it('returns canModify: true when entries are still open', async () => {
      // Entry close date is in the future
      mockShowsTable.getShowById.mockResolvedValue(
        makeShow({ entryCloseDate: '2099-12-31', status: 'published' })
      );

      const result = await canModifyEntry('show-1');

      expect(result.canModify).toBe(true);
    });

    it('returns canModify: false when entry deadline has passed', async () => {
      mockShowsTable.getShowById.mockResolvedValue(
        makeShow({ entryCloseDate: '2020-01-01', status: 'published' })
      );

      const result = await canModifyEntry('show-1');

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('Entry deadline has passed');
    });

    it('returns canModify: false when show is completed', async () => {
      mockShowsTable.getShowById.mockResolvedValue(
        makeShow({ entryCloseDate: '2099-12-31', status: 'completed' })
      );

      const result = await canModifyEntry('show-1');

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('Show is no longer active');
    });

    it('returns canModify: false when show is cancelled', async () => {
      mockShowsTable.getShowById.mockResolvedValue(
        makeShow({ entryCloseDate: '2099-12-31', status: 'cancelled' })
      );

      const result = await canModifyEntry('show-1');

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('Show is no longer active');
    });

    it('returns canModify: false when show not found', async () => {
      mockShowsTable.getShowById.mockResolvedValue(null);

      const result = await canModifyEntry('non-existent');

      expect(result.canModify).toBe(false);
      expect(result.reason).toBe('Show not found');
    });
  });
});
