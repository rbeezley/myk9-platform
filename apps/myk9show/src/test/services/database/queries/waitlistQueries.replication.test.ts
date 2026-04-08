import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedWaitlistEntry } from '@/services/replication/ReplicatedWaitlistEntriesTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockWaitlistTable, mockTrialsTable, mockClassesTable, mockDogsTable, mockEntriesTable } =
  vi.hoisted(() => ({
    mockWaitlistTable: {
      getByClass: vi.fn(),
      getByDog: vi.fn(),
      getById: vi.fn(),
      getAll: vi.fn(),
    },
    mockTrialsTable: {
      getTrialsByShow: vi.fn(),
    },
    mockClassesTable: {
      getClassesByTrial: vi.fn(),
      getClassById: vi.fn(),
      getAll: vi.fn(),
    },
    mockDogsTable: {
      getDogById: vi.fn(),
      getAll: vi.fn(),
    },
    mockEntriesTable: {
      getEntriesByClass: vi.fn(),
      getAll: vi.fn(),
    },
  }));

vi.mock('@/services/replication/ReplicatedWaitlistEntriesTable', () => ({
  replicatedWaitlistEntriesTable: mockWaitlistTable,
}));

vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: mockTrialsTable,
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
}));

// Now import the functions under test
import {
  getWaitlistByShow,
  getWaitlistByClass,
  getClassesWithWaitlistCounts,
  getWaitlistPosition,
} from '@/services/database/queries/waitlistQueries';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeWaitlistEntry(
  overrides: Partial<ReplicatedWaitlistEntry> = {}
): ReplicatedWaitlistEntry {
  return {
    id: 'wl-1',
    classId: 'class-1',
    dogId: 'dog-1',
    exhibitorId: 'exhib-1',
    position: 1,
    status: 'waiting',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    ...overrides,
  };
}

function makeTrial(overrides: Partial<ReplicatedTrial> = {}): ReplicatedTrial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    name: 'Trial 1',
    date: '2026-04-01',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    name: 'Novice A',
    trialId: 'trial-1',
    maxEntries: 20,
    ...overrides,
  };
}

function makeDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Rex',
    breed: 'German Shepherd',
    callName: 'Rexy',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    showId: 'show-1',
    dogId: 'dog-1',
    entryStatus: 'accepted',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('waitlistQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // getWaitlistByShow
  // -----------------------------------------------------------------------
  describe('getWaitlistByShow', () => {
    it('returns waitlist entries with dog/class joins, sorted by position', async () => {
      const trial = makeTrial();
      const cls = makeClass();
      const dog1 = makeDog({ id: 'dog-1', name: 'Rex', callName: 'Rexy' });
      const dog2 = makeDog({ id: 'dog-2', name: 'Bella', callName: 'Bell' });

      mockTrialsTable.getTrialsByShow.mockResolvedValue([trial]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([cls]);
      mockWaitlistTable.getByClass.mockResolvedValue([
        makeWaitlistEntry({ id: 'wl-2', dogId: 'dog-2', position: 2 }),
        makeWaitlistEntry({ id: 'wl-1', dogId: 'dog-1', position: 1 }),
      ]);
      mockDogsTable.getDogById.mockImplementation(async (id: string) => {
        if (id === 'dog-1') return dog1;
        if (id === 'dog-2') return dog2;
        return null;
      });

      const result = await getWaitlistByShow('show-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(2);
      // Should be sorted by position
      expect(result.data[0].id).toBe('wl-1');
      expect(result.data[0].position).toBe(1);
      expect(result.data[0].dog?.name).toBe('Rex');
      expect(result.data[0].class?.name).toBe('Novice A');
      expect(result.data[1].id).toBe('wl-2');
      expect(result.data[1].position).toBe(2);
      expect(result.data[1].dog?.name).toBe('Bella');
    });

    it('returns empty array when no trials exist', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([]);

      const result = await getWaitlistByShow('show-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('returns empty array when no classes exist', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([makeTrial()]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([]);

      const result = await getWaitlistByShow('show-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('returns empty array when no waitlist entries exist', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([makeTrial()]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([makeClass()]);
      mockWaitlistTable.getByClass.mockResolvedValue([]);

      const result = await getWaitlistByShow('show-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getWaitlistByClass
  // -----------------------------------------------------------------------
  describe('getWaitlistByClass', () => {
    it('returns sorted entries with dog/class joins', async () => {
      const cls = makeClass();
      const dog = makeDog();

      mockWaitlistTable.getByClass.mockResolvedValue([
        makeWaitlistEntry({ id: 'wl-1', position: 1 }),
      ]);
      mockClassesTable.getClassById.mockResolvedValue(cls);
      mockDogsTable.getDogById.mockResolvedValue(dog);

      const result = await getWaitlistByClass('class-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('wl-1');
      expect(result.data[0].dog?.name).toBe('Rex');
      expect(result.data[0].class?.name).toBe('Novice A');
      expect(result.data[0].class?.max_entries).toBe(20);
    });

    it('returns empty array when no entries', async () => {
      mockWaitlistTable.getByClass.mockResolvedValue([]);
      mockClassesTable.getClassById.mockResolvedValue(makeClass());

      const result = await getWaitlistByClass('class-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('handles null dog gracefully', async () => {
      mockWaitlistTable.getByClass.mockResolvedValue([makeWaitlistEntry()]);
      mockClassesTable.getClassById.mockResolvedValue(makeClass());
      mockDogsTable.getDogById.mockResolvedValue(null);

      const result = await getWaitlistByClass('class-1');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].dog).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // getClassesWithWaitlistCounts
  // -----------------------------------------------------------------------
  describe('getClassesWithWaitlistCounts', () => {
    it('returns classes with accepted_count and waitlist_count', async () => {
      const trial = makeTrial();
      const cls = makeClass({ id: 'class-1', name: 'Novice A', trialId: 'trial-1' });

      mockTrialsTable.getTrialsByShow.mockResolvedValue([trial]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([cls]);
      mockEntriesTable.getEntriesByClass.mockResolvedValue([
        makeEntry({ entryStatus: 'accepted' }),
        makeEntry({ id: 'entry-2', entryStatus: 'accepted' }),
        makeEntry({ id: 'entry-3', entryStatus: 'pending' }),
      ]);
      mockWaitlistTable.getByClass.mockResolvedValue([
        makeWaitlistEntry({ id: 'wl-1' }),
        makeWaitlistEntry({ id: 'wl-2' }),
      ]);

      const result = await getClassesWithWaitlistCounts('show-1');

      expect(result.error).toBeNull();
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('class-1');
      expect(result.data[0].accepted_count).toBe(2);
      expect(result.data[0].waitlist_count).toBe(2);
      expect(result.data[0].trial?.name).toBe('Trial 1');
    });

    it('returns empty array when no trials', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([]);

      const result = await getClassesWithWaitlistCounts('show-1');

      expect(result.data).toEqual([]);
      expect(result.error).toBeNull();
    });

    it('sorts classes by name', async () => {
      const trial = makeTrial();
      mockTrialsTable.getTrialsByShow.mockResolvedValue([trial]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([
        makeClass({ id: 'c2', name: 'Open', trialId: 'trial-1' }),
        makeClass({ id: 'c1', name: 'Advanced', trialId: 'trial-1' }),
      ]);
      mockEntriesTable.getEntriesByClass.mockResolvedValue([]);
      mockWaitlistTable.getByClass.mockResolvedValue([]);

      const result = await getClassesWithWaitlistCounts('show-1');

      expect(result.data[0].name).toBe('Advanced');
      expect(result.data[1].name).toBe('Open');
    });

    it('returns zero counts when no entries or waitlist', async () => {
      mockTrialsTable.getTrialsByShow.mockResolvedValue([makeTrial()]);
      mockClassesTable.getClassesByTrial.mockResolvedValue([makeClass()]);
      mockEntriesTable.getEntriesByClass.mockResolvedValue([]);
      mockWaitlistTable.getByClass.mockResolvedValue([]);

      const result = await getClassesWithWaitlistCounts('show-1');

      expect(result.data[0].accepted_count).toBe(0);
      expect(result.data[0].waitlist_count).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // getWaitlistPosition
  // -----------------------------------------------------------------------
  describe('getWaitlistPosition', () => {
    it('returns the position number', async () => {
      mockWaitlistTable.getById.mockResolvedValue(makeWaitlistEntry({ position: 3 }));

      const result = await getWaitlistPosition('wl-1');

      expect(result.position).toBe(3);
      expect(result.error).toBeNull();
    });

    it('returns null when entry not found', async () => {
      mockWaitlistTable.getById.mockResolvedValue(null);

      const result = await getWaitlistPosition('wl-999');

      expect(result.position).toBeNull();
      expect(result.error).toBeNull();
    });
  });
});
