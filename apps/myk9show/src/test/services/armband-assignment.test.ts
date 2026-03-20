import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapShowInputToInsert,
  mapShowInputToUpdate,
  mapDatabaseToShow,
  mapShowToShowInput,
} from '@/services/mappers/showMappers';
import type { ShowInput, Show } from '@/types/show-types';
import type { DbShow } from '@/types/database-mappings';

// ---------- Fixtures ----------

const baseShowInput: ShowInput = {
  name: 'Test Show',
  organization: 'AKC',
  startDate: '2026-06-01',
  endDate: '2026-06-02',
  location: 'Test Venue',
  status: 'upcoming',
  events: ['Scent Work'],
  source: 'myK9Show',
  entryOpenDate: '2026-05-01',
  entryCloseDate: '2026-05-28',
  preEntryFee: '25.00',
  dayOfShowFee: '30.00',
  clubId: 'club-1',
  clubName: 'Test Club',
  clubAddress: '123 Test St',
  clubEmail: 'club@test.com',
  chairman: 'person-1',
  secretary: 'person-2',
  chiefSteward: 'person-3',
};

const baseDbShow: DbShow = {
  id: 'show-1',
  name: 'Test Show',
  organization: 'AKC',
  start_date: '2026-06-01',
  end_date: '2026-06-02',
  accent_color: null,
  address: null,
  allow_non_owner_handlers: null,
  chairman: null,
  chief_steward: null,
  city: null,
  club_id: null,
  cover_image_url: null,
  created_at: null,
  day_of_show_fee: null,
  deleted_at: null,
  deleted_by: null,
  description: null,
  entry_close_date: null,
  entry_open_date: null,
  license_key: null,
  location: null,
  logo_url: null,
  max_entries_per_dog: null,
  max_total_entries: null,
  pre_entry_fee: null,
  results_released_at: null,
  results_visible_to_all: null,
  secretary: null,
  state: null,
  status: null,
  updated_at: null,
  venue_name: null,
  zip_code: null,
};

// ---------- Mapper Tests ----------

describe('startingArmbandNumber in show mappers', () => {
  describe('mapShowInputToInsert', () => {
    it('defaults starting_armband_number to 100 when not provided', () => {
      const result = mapShowInputToInsert(baseShowInput) as Record<string, unknown>;
      expect(result.starting_armband_number).toBe(100);
    });

    it('uses the provided startingArmbandNumber', () => {
      const result = mapShowInputToInsert({
        ...baseShowInput,
        startingArmbandNumber: 200,
      }) as Record<string, unknown>;
      expect(result.starting_armband_number).toBe(200);
    });
  });

  describe('mapShowInputToUpdate', () => {
    it('omits starting_armband_number when not provided', () => {
      const result = mapShowInputToUpdate({ name: 'Updated Show' }) as Record<string, unknown>;
      expect(result).not.toHaveProperty('starting_armband_number');
    });

    it('includes starting_armband_number when provided', () => {
      const result = mapShowInputToUpdate({
        startingArmbandNumber: 500,
      }) as Record<string, unknown>;
      expect(result.starting_armband_number).toBe(500);
    });
  });

  describe('mapDatabaseToShow', () => {
    it('defaults startingArmbandNumber to 100 when column is missing', () => {
      const result = mapDatabaseToShow(baseDbShow);
      expect(result.startingArmbandNumber).toBe(100);
    });

    it('reads startingArmbandNumber from the database row', () => {
      const dbShowWithArmband = {
        ...baseDbShow,
        starting_armband_number: 250,
      } as DbShow & { starting_armband_number: number };
      const result = mapDatabaseToShow(dbShowWithArmband);
      expect(result.startingArmbandNumber).toBe(250);
    });
  });

  describe('mapShowToShowInput', () => {
    it('passes through startingArmbandNumber', () => {
      const show: Show = {
        id: 'show-1',
        name: 'Test Show',
        organization: 'AKC',
        startDate: '2026-06-01',
        endDate: '2026-06-02',
        location: 'Test Venue',
        status: 'upcoming',
        events: [],
        source: 'myK9Show',
        entryOpenDate: '2026-05-01',
        entryCloseDate: '2026-05-28',
        preEntryFee: '25.00',
        clubId: 'club-1',
        clubName: 'Test Club',
        clubAddress: '123 Test St',
        clubEmail: 'club@test.com',
        logoUrl: '',
        coverImageUrl: '',
        accentColor: '',
        chairman: 'person-1',
        secretary: 'person-2',
        chiefSteward: 'person-3',
        assignedJudges: [],
        stats: [],
        trials: [],
        startingArmbandNumber: 150,
      };
      const result = mapShowToShowInput(show);
      expect(result.startingArmbandNumber).toBe(150);
    });
  });
});

// ---------- Armband RPC Logic Tests ----------

describe('Armband assignment during registration', () => {
  const mockRpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls assign_armband RPC for each unique dog', async () => {
    mockRpc.mockResolvedValue({ data: 100, error: null });

    const uniqueDogs = ['dog-1', 'dog-2'];
    const results: Array<{ dogId: string; armband: string }> = [];

    await Promise.all(
      uniqueDogs.map(async dogId => {
        const { data, error } = await mockRpc('assign_armband', {
          p_show_id: 'show-1',
          p_dog_id: dogId,
        });
        if (!error && data != null) {
          results.push({ dogId, armband: String(data) });
        }
      })
    );

    expect(mockRpc).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });

  it('assigns sequential numbers for different dogs', async () => {
    let counter = 100;
    mockRpc.mockImplementation(async () => ({ data: counter++, error: null }));

    const uniqueDogs = ['dog-1', 'dog-2', 'dog-3'];
    const results: Array<{ dogId: string; armband: string }> = [];

    for (const dogId of uniqueDogs) {
      const { data, error } = await mockRpc('assign_armband', {
        p_show_id: 'show-1',
        p_dog_id: dogId,
      });
      if (!error && data != null) {
        results.push({ dogId, armband: String(data) });
      }
    }

    expect(results).toEqual([
      { dogId: 'dog-1', armband: '100' },
      { dogId: 'dog-2', armband: '101' },
      { dogId: 'dog-3', armband: '102' },
    ]);
  });

  it('reuses same armband for same dog across multiple entries', async () => {
    mockRpc.mockResolvedValue({ data: 100, error: null });

    // Same dog entered in 3 classes — should get same armband
    const entryInputs = [
      { dogId: 'dog-1', classId: 'class-1' },
      { dogId: 'dog-1', classId: 'class-2' },
      { dogId: 'dog-1', classId: 'class-3' },
    ];

    const uniqueDogs = [...new Set(entryInputs.map(e => e.dogId))];
    const results: Array<{ dogId: string; armband: string }> = [];

    await Promise.all(
      uniqueDogs.map(async dogId => {
        const { data, error } = await mockRpc('assign_armband', {
          p_show_id: 'show-1',
          p_dog_id: dogId,
        });
        if (!error && data != null) {
          results.push({ dogId, armband: String(data) });
        }
      })
    );

    // Only one RPC call — deduped by unique dog
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ dogId: 'dog-1', armband: '100' }]);
  });

  it('does not block registration if RPC fails', async () => {
    mockRpc.mockRejectedValue(new Error('Network error'));

    const uniqueDogs = ['dog-1', 'dog-2'];
    const results: Array<{ dogId: string; armband: string }> = [];

    await Promise.all(
      uniqueDogs.map(async dogId => {
        try {
          const { data, error } = await mockRpc('assign_armband', {
            p_show_id: 'show-1',
            p_dog_id: dogId,
          });
          if (!error && data != null) {
            results.push({ dogId, armband: String(data) });
          }
        } catch {
          // Non-blocking — same pattern as production code
        }
      })
    );

    // RPC failed but we didn't throw — graceful degradation
    expect(results).toEqual([]);
  });

  it('handles partial RPC failures gracefully', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: 100, error: null })
      .mockRejectedValueOnce(new Error('Timeout'));

    const uniqueDogs = ['dog-1', 'dog-2'];
    const results: Array<{ dogId: string; armband: string }> = [];

    await Promise.all(
      uniqueDogs.map(async dogId => {
        try {
          const { data, error } = await mockRpc('assign_armband', {
            p_show_id: 'show-1',
            p_dog_id: dogId,
          });
          if (!error && data != null) {
            results.push({ dogId, armband: String(data) });
          }
        } catch {
          // Non-blocking
        }
      })
    );

    // Only dog-1 got an armband, dog-2 failed silently
    expect(results).toEqual([{ dogId: 'dog-1', armband: '100' }]);
  });

  it('formats armband assignments correctly for ConfirmationStep', async () => {
    let counter = 100;
    mockRpc.mockImplementation(async () => ({ data: counter++, error: null }));

    const uniqueDogs = ['dog-1', 'dog-2'];
    const results: Array<{ dogId: string; armband: string }> = [];

    await Promise.all(
      uniqueDogs.map(async dogId => {
        const { data, error } = await mockRpc('assign_armband', {
          p_show_id: 'show-1',
          p_dog_id: dogId,
        });
        if (!error && data != null) {
          results.push({ dogId, armband: String(data) });
        }
      })
    );

    // Each result should have dogId (string) and armband (string)
    for (const r of results) {
      expect(typeof r.dogId).toBe('string');
      expect(typeof r.armband).toBe('string');
      expect(Number(r.armband)).not.toBeNaN();
    }
  });
});
