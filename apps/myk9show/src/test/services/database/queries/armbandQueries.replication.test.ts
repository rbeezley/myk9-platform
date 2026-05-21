import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReplicatedArmband } from '@/services/replication/ReplicatedArmbandsTable';
import type { ReplicatedDog } from '@/services/replication/ReplicatedDogsTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';

// ---------------------------------------------------------------------------
// Mock the replication singletons using vi.hoisted so the variables are
// available when vi.mock factories execute (vi.mock is hoisted above const).
// ---------------------------------------------------------------------------

const { mockArmbandsTable, mockDogsTable, mockEntriesTable, mockClassesTable } = vi.hoisted(() => ({
  mockArmbandsTable: {
    getByShow: vi.fn(),
    getByDog: vi.fn(),
    lookupByArmbandNumber: vi.fn(),
    getAll: vi.fn(),
  },
  mockDogsTable: {
    getDogById: vi.fn(),
    getAllDogs: vi.fn(),
    getAll: vi.fn(),
  },
  mockEntriesTable: {
    getAll: vi.fn(),
    getEntriesByShow: vi.fn(),
  },
  mockClassesTable: {
    getClassById: vi.fn(),
    getAll: vi.fn(),
  },
}));

vi.mock('@/services/replication/ReplicatedArmbandsTable', () => ({
  replicatedArmbandsTable: mockArmbandsTable,
}));

vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: mockDogsTable,
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: mockEntriesTable,
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: mockClassesTable,
}));

// Mock supabase client for PostgREST owner lookup
const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn(),
    rpc: vi.fn(),
  };
  return { mockSupabase };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((err: unknown) => ({
    message: err instanceof Error ? err.message : String(err),
  })),
}));

// Now import the functions under test
import {
  claimNextArmband,
  getArmbandCountForShow,
  lookupDogByArmband,
} from '@/services/database/armbands';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeArmband(overrides: Partial<ReplicatedArmband> = {}): ReplicatedArmband {
  return {
    id: 'armband-1',
    showId: 'show-1',
    dogId: 'dog-1',
    armbandNumber: '101',
    assignedAt: '2026-04-01T00:00:00Z',
    isAvailable: false,
    ...overrides,
  };
}

function makeDog(overrides: Partial<ReplicatedDog> = {}): ReplicatedDog {
  return {
    id: 'dog-1',
    name: 'Rex',
    breed: 'German Shepherd',
    sex: 'M',
    ownerId: 'person-1',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'entry-1',
    showId: 'show-1',
    dogId: 'dog-1',
    classId: 'class-1',
    entryStatus: 'confirmed',
    handler: 'Jane Doe',
    ...overrides,
  };
}

function makeClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    name: 'Novice A',
    level: 'Novice',
    ...overrides,
  };
}

// Helper to set up the supabase.from().select().eq().maybeSingle() chain
function setupOwnerQuery(owner: { first_name: string; last_name: string } | null) {
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: owner, error: null }),
      }),
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('armbandQueries (replication)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('claimNextArmband', () => {
    it('syncs the assigned armband back to all entries for the dog in the show', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 104, error: null });

      const isMock = vi.fn().mockResolvedValue({ error: null });
      const secondEqMock = vi.fn().mockReturnValue({ is: isMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      const updateMock = vi.fn().mockReturnValue({ eq: firstEqMock });
      mockSupabase.from.mockReturnValue({ update: updateMock });

      const result = await claimNextArmband('show-1', 'dog-1');

      expect(result).toEqual({ armband: '104', error: null });
      expect(mockSupabase.rpc).toHaveBeenCalledWith('assign_armband', {
        p_show_id: 'show-1',
        p_dog_id: 'dog-1',
      });
      expect(mockSupabase.from).toHaveBeenCalledWith('entries');
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          armband: '104',
        })
      );
      expect(firstEqMock).toHaveBeenCalledWith('show_id', 'show-1');
      expect(secondEqMock).toHaveBeenCalledWith('dog_id', 'dog-1');
      expect(isMock).toHaveBeenCalledWith('deleted_at', null);
    });

    it('returns an error when the entry armband sync fails', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: 104, error: null });

      const updateError = new Error('update failed');
      const isMock = vi.fn().mockResolvedValue({ error: updateError });
      const secondEqMock = vi.fn().mockReturnValue({ is: isMock });
      const firstEqMock = vi.fn().mockReturnValue({ eq: secondEqMock });
      mockSupabase.from.mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: firstEqMock }),
      });

      const result = await claimNextArmband('show-1', 'dog-1');

      expect(result.armband).toBeNull();
      expect(result.error).toEqual({ message: 'update failed' });
    });
  });

  // -----------------------------------------------------------------------
  // getArmbandCountForShow
  // -----------------------------------------------------------------------
  describe('getArmbandCountForShow', () => {
    it('returns correct count from replication store', async () => {
      mockArmbandsTable.getByShow.mockResolvedValue([
        makeArmband({ id: 'a1' }),
        makeArmband({ id: 'a2', armbandNumber: '102' }),
        makeArmband({ id: 'a3', armbandNumber: '103' }),
      ]);

      const result = await getArmbandCountForShow('show-1');

      expect(result.count).toBe(3);
      expect(result.error).toBeNull();
      expect(mockArmbandsTable.getByShow).toHaveBeenCalledWith('show-1');
    });

    it('returns 0 when no armbands exist', async () => {
      mockArmbandsTable.getByShow.mockResolvedValue([]);

      const result = await getArmbandCountForShow('show-1');

      expect(result.count).toBe(0);
      expect(result.error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // lookupDogByArmband
  // -----------------------------------------------------------------------
  describe('lookupDogByArmband', () => {
    it('returns composite shape with dog, owner, and entries', async () => {
      const armband = makeArmband();
      const dog = makeDog();
      const entry = makeEntry();
      const cls = makeClass();

      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(armband);
      mockDogsTable.getDogById.mockResolvedValue(dog);
      mockEntriesTable.getAll.mockResolvedValue([entry]);
      mockClassesTable.getClassById.mockResolvedValue(cls);
      setupOwnerQuery({ first_name: 'John', last_name: 'Smith' });

      const result = await lookupDogByArmband('show-1', '101');

      expect(result.error).toBeNull();
      expect(result.data).not.toBeNull();

      const data = result.data!;
      expect(data.armband_number).toBe('101');
      expect(data.dog.id).toBe('dog-1');
      expect(data.dog.name).toBe('Rex');
      expect(data.dog.breed).toBe('German Shepherd');
      expect(data.dog.sex).toBe('M');
      expect(data.owner.first_name).toBe('John');
      expect(data.owner.last_name).toBe('Smith');
      expect(data.entries).toHaveLength(1);
      expect(data.entries[0].id).toBe('entry-1');
      expect(data.entries[0].entry_status).toBe('confirmed');
      expect(data.entries[0].handler).toBe('Jane Doe');
      expect(data.entries[0].class_name).toBe('Novice A');
      expect(data.entries[0].class_level).toBe('Novice');
    });

    it('returns null when armband not found', async () => {
      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(null);

      const result = await lookupDogByArmband('show-1', '999');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('returns null when dog not found', async () => {
      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(makeArmband());
      mockDogsTable.getDogById.mockResolvedValue(null);

      const result = await lookupDogByArmband('show-1', '101');

      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });

    it('uses default owner when no owner found', async () => {
      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(makeArmband());
      mockDogsTable.getDogById.mockResolvedValue(makeDog({ ownerId: undefined }));
      mockEntriesTable.getAll.mockResolvedValue([]);
      mockClassesTable.getClassById.mockResolvedValue(null);

      const result = await lookupDogByArmband('show-1', '101');

      expect(result.data).not.toBeNull();
      expect(result.data!.owner.first_name).toBe('Unknown');
      expect(result.data!.owner.last_name).toBe('');
    });

    it('filters entries to only the correct dog and show', async () => {
      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(makeArmband());
      mockDogsTable.getDogById.mockResolvedValue(makeDog());
      setupOwnerQuery({ first_name: 'John', last_name: 'Smith' });

      // Mix of entries — only dog-1 + show-1 should be included
      mockEntriesTable.getAll.mockResolvedValue([
        makeEntry({ id: 'e1', dogId: 'dog-1', showId: 'show-1' }),
        makeEntry({ id: 'e2', dogId: 'dog-2', showId: 'show-1' }), // wrong dog
        makeEntry({ id: 'e3', dogId: 'dog-1', showId: 'show-2' }), // wrong show
      ]);
      mockClassesTable.getClassById.mockResolvedValue(makeClass());

      const result = await lookupDogByArmband('show-1', '101');

      expect(result.data!.entries).toHaveLength(1);
      expect(result.data!.entries[0].id).toBe('e1');
    });

    it('handles entries with no class gracefully', async () => {
      mockArmbandsTable.lookupByArmbandNumber.mockResolvedValue(makeArmband());
      mockDogsTable.getDogById.mockResolvedValue(makeDog());
      setupOwnerQuery({ first_name: 'John', last_name: 'Smith' });
      mockEntriesTable.getAll.mockResolvedValue([makeEntry({ classId: undefined })]);

      const result = await lookupDogByArmband('show-1', '101');

      expect(result.data!.entries).toHaveLength(1);
      expect(result.data!.entries[0].class_name).toBe('');
      expect(result.data!.entries[0].class_level).toBeNull();
    });
  });
});
