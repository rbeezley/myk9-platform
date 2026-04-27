import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockClassesTable, mockEntriesTable, mockTrialsTable, mockDogsTable } = vi.hoisted(() => ({
  mockClassesTable: {
    getAll: vi.fn(),
    getClassById: vi.fn(),
    getClassesByTrial: vi.fn(),
  },
  mockEntriesTable: {
    getAll: vi.fn(),
    getEntriesByClass: vi.fn(),
  },
  mockTrialsTable: {
    getAll: vi.fn(),
    getTrialById: vi.fn(),
  },
  mockDogsTable: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));

// Now import the functions under test
import {
  getAllClasses,
  getClassById,
  getClassesByTrialId,
  searchClasses,
  getClassStatistics,
} from '@/services/database/queries/classQueries';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    name: 'Novice A Containers',
    trialId: 'trial-1',
    description: 'Containers Novice A',
    level: 'Novice',
    entryFee: 30,
    maxEntries: 40,
    startTime: '08:00:00',
    element: 'Containers',
    section: 'A',
    judgeName: 'Jane Smith',
    judgeId: 'person-1',
    classStatus: 'upcoming',
    classOrder: 1,
    isCompleted: false,
    isScoringFinalized: false,
    isResultsReviewed: false,
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
    maxEntriesPerDog: 2,
    maxTotalEntries: 50,
    maxEntriesPerHandler: 3,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    dogId: 'dog-1',
    entryStatus: 'pending',
    dogCallName: 'Buddy',
    dogBreed: 'Labrador',
    handlerName: 'John Doe',
    ...overrides,
  };
}

function makeDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Buddy',
    breed: 'Labrador',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers to set up default mocks for list queries
// ---------------------------------------------------------------------------

function setupListMocks(
  classes: ReplicatedClass[] = [makeClass()],
  trials: ReplicatedTrial[] = [makeTrial()],
  entries: ReplicatedEntry[] = [makeEntry()]
) {
  mockClassesTable.getAll.mockResolvedValue(classes);
  mockTrialsTable.getAll.mockResolvedValue(trials);
  mockEntriesTable.getAll.mockResolvedValue(entries);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('classQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getAllClasses
  // -----------------------------------------------------------------------
  describe('getAllClasses', () => {
    it('returns correct snake_case shape with joined data', async () => {
      setupListMocks();

      const result = await getAllClasses();

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);

      const row = result.data[0] as Record<string, unknown>;
      // Class fields
      expect(row.id).toBe('class-1');
      expect(row.name).toBe('Novice A Containers');
      expect(row.trial_id).toBe('trial-1');
      expect(row.level).toBe('Novice');
      expect(row.entry_fee).toBe(30);
      expect(row.deleted_at).toBeNull();

      // Trial sub-object
      const trial = row.trial as Record<string, unknown>;
      expect(trial.id).toBe('trial-1');
      expect(trial.name).toBe('Trial 1');
      expect(trial.date).toBe('2026-05-01');
      expect(trial.trial_number).toBe('1');

      // Entries array (id-only for count)
      const entries = row.entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(1);

      // Judge assignments from denormalized fields
      const ja = row.judge_assignments as Array<Record<string, unknown>>;
      expect(ja).toHaveLength(1);
      expect(ja[0].person_id).toBe('person-1');
      expect((ja[0].people as Record<string, unknown>).first_name).toBe('Jane');
      expect((ja[0].people as Record<string, unknown>).last_name).toBe('Smith');
    });

    it('returns empty array when no classes exist', async () => {
      setupListMocks([], [], []);

      const result = await getAllClasses();

      expect(result.error).toBeNull();
      expect(result.data).toEqual([]);
    });

    it('sets trial to null when class has no trialId', async () => {
      setupListMocks([makeClass({ trialId: undefined })]);

      const result = await getAllClasses();
      const row = result.data[0] as Record<string, unknown>;
      expect(row.trial).toBeNull();
    });

    it('omits judge_assignments when no judge is assigned', async () => {
      setupListMocks([makeClass({ judgeId: undefined, judgeName: undefined })]);

      const result = await getAllClasses();
      const row = result.data[0] as Record<string, unknown>;
      // Empty array when no judge assigned (no denormalized judge fields)
      expect(row.judge_assignments).toEqual([]);
    });

    it('counts entries per class correctly', async () => {
      const classes = [makeClass({ id: 'c1' }), makeClass({ id: 'c2' })];
      const entries = [
        makeEntry({ id: 'e1', classId: 'c1' }),
        makeEntry({ id: 'e2', classId: 'c1' }),
        makeEntry({ id: 'e3', classId: 'c2' }),
      ];
      setupListMocks(classes, [makeTrial()], entries);

      const result = await getAllClasses();

      const row1 = result.data[0] as Record<string, unknown>;
      const row2 = result.data[1] as Record<string, unknown>;
      expect((row1.entries as unknown[]).length).toBe(2);
      expect((row2.entries as unknown[]).length).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // getClassById
  // -----------------------------------------------------------------------
  describe('getClassById', () => {
    it('returns correct snake_case shape with entries and dog join', async () => {
      mockClassesTable.getClassById.mockResolvedValue(makeClass());
      mockTrialsTable.getTrialById.mockResolvedValue(makeTrial());
      mockEntriesTable.getEntriesByClass.mockResolvedValue([makeEntry()]);
      mockDogsTable.getAll.mockResolvedValue([makeDog()]);

      const result = await getClassById('class-1');

      expect(result.error).toBeNull();
      const row = result.data as Record<string, unknown>;
      expect(row.id).toBe('class-1');

      // Trial sub-object
      const trial = row.trial as Record<string, unknown>;
      expect(trial.id).toBe('trial-1');

      // Entries with dog join
      const entries = row.entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(1);
      expect(entries[0].entry_status).toBe('pending');

      const dog = entries[0].dog as Record<string, unknown>;
      expect(dog.id).toBe('dog-1');
      expect(dog.name).toBe('Buddy');
      expect(dog.breed).toBe('Labrador');
      expect(dog.owner).toBeNull(); // people not replicated
    });

    it('returns { data: null, error: null } for missing records', async () => {
      mockClassesTable.getClassById.mockResolvedValue(null);

      const result = await getClassById('non-existent');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('uses dogCallName fallback when dog not in dogs table', async () => {
      mockClassesTable.getClassById.mockResolvedValue(makeClass());
      mockTrialsTable.getTrialById.mockResolvedValue(makeTrial());
      mockEntriesTable.getEntriesByClass.mockResolvedValue([
        makeEntry({ dogId: 'unknown-dog', dogCallName: 'Rex', dogBreed: 'Poodle' }),
      ]);
      mockDogsTable.getAll.mockResolvedValue([]); // no dogs replicated

      const result = await getClassById('class-1');
      const entries = (result.data as Record<string, unknown>).entries as Array<
        Record<string, unknown>
      >;
      const dog = entries[0].dog as Record<string, unknown>;
      expect(dog.name).toBe('Rex');
      expect(dog.breed).toBe('Poodle');
    });
  });

  // -----------------------------------------------------------------------
  // getClassesByTrialId
  // -----------------------------------------------------------------------
  describe('getClassesByTrialId', () => {
    it('returns classes filtered by trial with entry counts', async () => {
      mockClassesTable.getClassesByTrial.mockResolvedValue([
        makeClass({ id: 'c1' }),
        makeClass({ id: 'c2' }),
      ]);
      mockEntriesTable.getAll.mockResolvedValue([
        makeEntry({ id: 'e1', classId: 'c1' }),
        makeEntry({ id: 'e2', classId: 'c1' }),
      ]);

      const result = await getClassesByTrialId('trial-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);

      const row1 = result.data[0] as Record<string, unknown>;
      const row2 = result.data[1] as Record<string, unknown>;
      expect((row1.entries as unknown[]).length).toBe(2);
      expect((row2.entries as unknown[]).length).toBe(0);
    });

    it('returns judge data on each class via the synthesized join', async () => {
      // Regression: prior to this fix the replication path dropped judge data
      // because mapReplicatedClassToDbRow only attached judge_assignments when
      // explicitly passed in options (which getClassesByTrialId never did).
      mockClassesTable.getClassesByTrial.mockResolvedValue([
        makeClass({ id: 'c1', judgeId: 'judge-1', judgeName: 'Richard Beezley' }),
      ]);
      mockEntriesTable.getAll.mockResolvedValue([]);

      const result = await getClassesByTrialId('trial-1');
      const row = result.data[0] as Record<string, unknown>;
      const ja = row.judge_assignments as Array<Record<string, unknown>>;

      expect(ja).toHaveLength(1);
      expect(ja[0].person_id).toBe('judge-1');
      expect((ja[0].people as Record<string, unknown>).first_name).toBe('Richard');
      expect((ja[0].people as Record<string, unknown>).last_name).toBe('Beezley');
    });

    it('returns empty array when no classes for trial', async () => {
      mockClassesTable.getClassesByTrial.mockResolvedValue([]);
      mockEntriesTable.getAll.mockResolvedValue([]);

      const result = await getClassesByTrialId('trial-99');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // searchClasses
  // -----------------------------------------------------------------------
  describe('searchClasses', () => {
    it('filters by name case-insensitively', async () => {
      const classes = [
        makeClass({ id: 'match', name: 'Novice A Containers' }),
        makeClass({
          id: 'no-match',
          name: 'Excellent B Exterior',
          level: 'Excellent',
          description: 'Exterior Excellent B',
        }),
      ];
      mockClassesTable.getAll.mockResolvedValue(classes);

      const result = await searchClasses('containers');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('filters by level case-insensitively', async () => {
      const classes = [
        makeClass({ id: 'match', name: 'Class A', level: 'Advanced' }),
        makeClass({ id: 'no-match', name: 'Class B', level: 'Novice' }),
      ];
      mockClassesTable.getAll.mockResolvedValue(classes);

      const result = await searchClasses('ADVANCED');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('filters by description case-insensitively', async () => {
      const classes = [
        makeClass({ id: 'match', name: 'Class A', description: 'Interior search exercise' }),
        makeClass({ id: 'no-match', name: 'Class B', description: 'Exterior buried' }),
      ];
      mockClassesTable.getAll.mockResolvedValue(classes);

      const result = await searchClasses('interior');

      expect(result.data).toHaveLength(1);
      expect((result.data[0] as Record<string, unknown>).id).toBe('match');
    });

    it('respects limit parameter', async () => {
      const classes = Array.from({ length: 10 }, (_, i) =>
        makeClass({ id: `cls-${i}`, name: `Containers ${i}` })
      );
      mockClassesTable.getAll.mockResolvedValue(classes);

      const result = await searchClasses('containers', 3);

      expect(result.data).toHaveLength(3);
    });

    it('returns empty array for no matches', async () => {
      mockClassesTable.getAll.mockResolvedValue([makeClass()]);

      const result = await searchClasses('zzzznonexistent');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getClassStatistics
  // -----------------------------------------------------------------------
  describe('getClassStatistics', () => {
    it('returns total count of classes', async () => {
      mockClassesTable.getAll.mockResolvedValue([
        makeClass({ id: 'a' }),
        makeClass({ id: 'b' }),
        makeClass({ id: 'c' }),
      ]);

      const result = await getClassStatistics();

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ total: 3 });
    });

    it('returns 0 when no classes exist', async () => {
      mockClassesTable.getAll.mockResolvedValue([]);

      const result = await getClassStatistics();

      expect(result.data).toEqual({ total: 0 });
      expect(result.error).toBeNull();
    });
  });
});
