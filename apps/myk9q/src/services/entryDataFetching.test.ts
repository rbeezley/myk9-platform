/**
 * Tests for entryDataFetching module
 */

import { vi } from 'vitest';
import {
  fetchClassEntriesFromDatabase,
  fetchTrialEntriesFromDatabase,
  fetchEntriesByArmbandFromDatabase,
} from './entryDataFetching';
import { supabase } from '../lib/supabase';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

// Mock utility functions
vi.mock('@/utils/stringUtils', () => ({
  buildClassName: vi.fn((element: string, level: string, section: string) =>
    `${level} ${section} ${element}`
  ),
}));

vi.mock('@/utils/timeUtils', () => ({
  formatTimeLimitSeconds: vi.fn((seconds: number | null) =>
    seconds ? `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}` : '0:00'
  ),
}));

vi.mock('@/utils/statusUtils', () => ({
  determineEntryStatus: vi.fn((entryStatus: string, inRing?: boolean) => {
    if (inRing) return 'in-ring';
    if (entryStatus === 'completed') return 'completed';
    if (entryStatus === 'checked-in') return 'checked-in';
    return 'no-status';
  }),
}));

vi.mock('@/utils/entryMappers', () => ({
  mapDatabaseRowToEntry: vi.fn((row, status, className) => ({
    id: row.id,
    armband: row.armband,
    callName: row.dog_call_name || 'Test Dog',
    breed: row.breed || 'Test Breed',
    handler: row.handler || 'Test Handler',
    jumpHeight: row.jump_height || '',
    preferredTime: row.preferred_time || '',
    isScored: row.is_scored || false,
    status,
    inRing: status === 'in-ring',
    checkedIn: status !== 'no-status',
    checkinStatus: status,
    resultText: row.result_status || 'pending',
    searchTime: row.search_time?.toString() || '0.00',
    faultCount: row.fault_count || 0,
    placement: row.placement,
    classId: row.class_id,
    className,
    section: row.section || 'A',
    element: row.element || 'Interior',
    level: row.level || 'Novice',
    timeLimit: '3:00',
    timeLimit2: '3:00',
    timeLimit3: '3:00',
    areas: 1,
  })),
}));

describe('entryDataFetching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchClassEntriesFromDatabase', () => {
    describe('Success Cases', () => {
      it('should fetch and map class entries successfully', async () => {
        const mockClassData = {
          element: 'Interior',
          level: 'Novice',
          section: 'A',
          area_count: 2,
          time_limit_seconds: 180,
          time_limit_area2_seconds: 180,
          time_limit_area3_seconds: null,
        };

        const mockViewData = [
          {
            id: 1,
            armband_number: 101,
            dog_call_name: 'Max',
            dog_breed: 'Border Collie',
            handler_name: 'John Doe',
            is_scored: false,
            entry_status: 'checked-in',
            result_status: 'pending',
            search_time_seconds: null,
            total_faults: 0,
            final_placement: null,
            total_correct_finds: 0,
            total_incorrect_finds: 0,
            no_finish_count: 0,
            points_earned: 0,
            class_id: 123,
            exhibitor_order: 1,
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: {
                trial_date: '2025-01-20',
                trial_number: 1,
              },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockViewData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([123], 123, 'TEST-KEY');

        expect(result).toHaveLength(1);
        expect(result[0].armband).toBe(101);
        expect(result[0].callName).toBe('Max');
        expect(result[0].className).toBe('Novice A Interior');
        expect(supabase.from).toHaveBeenCalledWith('classes');
        expect(supabase.from).toHaveBeenCalledWith('view_entry_with_results');
      });

      it('should handle multiple entries correctly', async () => {
        const mockClassData = {
          element: 'Interior',
          level: 'Novice',
          section: 'A',
          area_count: 1,
          time_limit_seconds: 180,
          time_limit_area2_seconds: null,
          time_limit_area3_seconds: null,
        };

        const mockViewData = [
          {
            id: 1,
            armband_number: 101,
            dog_call_name: 'Max',
            dog_breed: 'Border Collie',
            handler_name: 'John Doe',
            is_scored: false,
            entry_status: 'no-status',
            result_status: 'pending',
            search_time_seconds: null,
            total_faults: 0,
            final_placement: null,
            total_correct_finds: 0,
            total_incorrect_finds: 0,
            no_finish_count: 0,
            points_earned: 0,
            class_id: 123,
            exhibitor_order: 1,
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
          {
            id: 2,
            armband_number: 102,
            dog_call_name: 'Bella',
            dog_breed: 'Golden Retriever',
            handler_name: 'Jane Smith',
            is_scored: true,
            entry_status: 'completed',
            result_status: 'Q',
            search_time_seconds: 125.5,
            total_faults: 0,
            final_placement: 1,
            total_correct_finds: 4,
            total_incorrect_finds: 0,
            no_finish_count: 0,
            points_earned: 100,
            class_id: 123,
            exhibitor_order: 2,
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockViewData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([123], 123, 'TEST-KEY');

        expect(result).toHaveLength(2);
        expect(result[0].isScored).toBe(false);
        expect(result[1].isScored).toBe(true);
        expect(result[1].placement).toBe(1);
      });

      it('should return empty array when no entries found', async () => {
        const mockClassData = {
          element: 'Interior',
          level: 'Novice',
          section: 'A',
          area_count: 1,
          time_limit_seconds: 180,
          time_limit_area2_seconds: null,
          time_limit_area3_seconds: null,
        };

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [],
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([123], 123, 'TEST-KEY');

        expect(result).toEqual([]);
      });

      it('should handle multi-area classes correctly', async () => {
        const mockClassData = {
          element: 'Container',
          level: 'Advanced',
          section: 'B',
          area_count: 3,
          time_limit_seconds: 180,
          time_limit_area2_seconds: 150,
          time_limit_area3_seconds: 120,
        };

        const mockViewData = [
          {
            id: 1,
            armband_number: 201,
            dog_call_name: 'Scout',
            dog_breed: 'German Shepherd',
            handler_name: 'Bob Wilson',
            is_scored: false,
            entry_status: 'no-status',
            result_status: 'pending',
            search_time_seconds: null,
            total_faults: 0,
            final_placement: null,
            total_correct_finds: 0,
            total_incorrect_finds: 0,
            no_finish_count: 0,
            points_earned: 0,
            class_id: 456,
            exhibitor_order: 1,
            classes: {
              element: 'Container',
              level: 'Advanced',
              section: 'B',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockViewData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([456], 456, 'TEST-KEY');

        expect(result).toHaveLength(1);
        expect(result[0].areas).toBe(3);
        expect(result[0].timeLimit).toBe('3:00');
        expect(result[0].timeLimit2).toBe('2:30');
        expect(result[0].timeLimit3).toBe('2:00');
      });
    });

    describe('Error Cases', () => {
      it('should throw error when class not found', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { message: 'Class not found' },
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        await expect(
          fetchClassEntriesFromDatabase([999], 999, 'TEST-KEY')
        ).rejects.toThrow('Could not find class');
      });

      it('should throw error when view query fails', async () => {
        const mockClassData = {
          element: 'Interior',
          level: 'Novice',
          section: 'A',
          area_count: 1,
          time_limit_seconds: 180,
          time_limit_area2_seconds: null,
          time_limit_area3_seconds: null,
        };

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        await expect(
          fetchClassEntriesFromDatabase([123], 123, 'TEST-KEY')
        ).rejects.toThrow('Database error');
      });
    });

    describe('Data Mapping', () => {
      it('should map all entry fields correctly', async () => {
        const mockClassData = {
          element: 'Exterior',
          level: 'Excellent',
          section: 'C',
          area_count: 1,
          time_limit_seconds: 240,
          time_limit_area2_seconds: null,
          time_limit_area3_seconds: null,
        };

        const mockViewData = [
          {
            id: 5000,
            armband_number: 305,
            dog_call_name: 'Luna',
            dog_breed: 'Labrador Retriever',
            handler_name: 'Sarah Johnson',
            is_scored: true,
            entry_status: 'completed',
            result_status: 'Q',
            search_time_seconds: 195.75,
            total_faults: 2,
            final_placement: 3,
            total_correct_finds: 3,
            total_incorrect_finds: 1,
            no_finish_count: 0,
            points_earned: 85,
            disqualification_reason: null,
            excuse_reason: null,
            withdrawal_reason: null,
            class_id: 789,
            exhibitor_order: 15,
            classes: {
              element: 'Exterior',
              level: 'Excellent',
              section: 'C',
              trials: { trial_date: '2025-01-21', trial_number: 2 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockViewData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([789], 789, 'TEST-KEY');

        expect(result[0]).toMatchObject({
          id: 5000,
          armband: 305,
          callName: 'Luna',
          breed: 'Labrador Retriever',
          handler: 'Sarah Johnson',
          isScored: true,
          resultText: 'Q',
          searchTime: '195.75',
          faultCount: 2,
          placement: 3,
          correctFinds: 3,
          incorrectFinds: 1,
          totalPoints: 85,
          classId: 789,
          exhibitorOrder: 15,
          trialDate: '2025-01-21',
          trialNumber: '2',
        });
      });

      it('should handle null/undefined optional fields', async () => {
        const mockClassData = {
          element: 'Interior',
          level: 'Novice',
          section: 'A',
          area_count: 1,
          time_limit_seconds: 180,
          time_limit_area2_seconds: null,
          time_limit_area3_seconds: null,
        };

        const mockViewData = [
          {
            id: 1,
            armband_number: 101,
            dog_call_name: 'Max',
            dog_breed: 'Border Collie',
            handler_name: 'John Doe',
            is_scored: false,
            entry_status: 'no-status',
            result_status: null,
            search_time_seconds: null,
            total_faults: null,
            final_placement: null,
            total_correct_finds: null,
            total_incorrect_finds: null,
            no_finish_count: null,
            points_earned: null,
            disqualification_reason: null,
            excuse_reason: null,
            withdrawal_reason: null,
            class_id: 123,
            exhibitor_order: 1,
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: mockClassData,
                error: null,
              }),
            }),
            in: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockViewData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchClassEntriesFromDatabase([123], 123, 'TEST-KEY');

        expect(result[0].resultText).toBe('pending');
        expect(result[0].searchTime).toBe('0.00');
        expect(result[0].faultCount).toBe(0);
        expect(result[0].placement).toBeUndefined();
        expect(result[0].nqReason).toBeUndefined();
      });
    });
  });

  describe('fetchTrialEntriesFromDatabase', () => {
    describe('Success Cases', () => {
      it('should fetch trial entries successfully', async () => {
        const mockData = [
          {
            id: 1,
            armband: 101,
            dog_call_name: 'Max',
            breed: 'Border Collie',
            handler: 'John Doe',
            is_scored: false,
            entry_status: 'checked-in',
            class_id: 123,
            element: 'Interior',
            level: 'Novice',
            section: 'A',
            results: [],
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: mockData,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchTrialEntriesFromDatabase(1, 'TEST-KEY');

        expect(result).toHaveLength(1);
        expect(supabase.from).toHaveBeenCalledWith('entries');
      });

      it('should return empty array when no entries found', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchTrialEntriesFromDatabase(999, 'TEST-KEY');

        expect(result).toEqual([]);
      });
    });

    describe('Error Cases', () => {
      it('should throw error when database query fails', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Database error' },
                  }),
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        await expect(
          fetchTrialEntriesFromDatabase(1, 'TEST-KEY')
        ).rejects.toThrow('Database error');
      });
    });
  });

  describe('fetchEntriesByArmbandFromDatabase', () => {
    describe('Success Cases', () => {
      it('should fetch entries by armband successfully', async () => {
        const mockData = [
          {
            id: 1,
            armband: 101,
            dog_call_name: 'Max',
            breed: 'Border Collie',
            handler: 'John Doe',
            is_scored: false,
            entry_status: 'checked-in',
            class_id: 123,
            element: 'Interior',
            level: 'Novice',
            section: 'A',
            results: [],
            classes: {
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
          {
            id: 2,
            armband: 101,
            dog_call_name: 'Max',
            breed: 'Border Collie',
            handler: 'John Doe',
            is_scored: false,
            entry_status: 'no-status',
            class_id: 124,
            element: 'Container',
            level: 'Novice',
            section: 'A',
            results: [],
            classes: {
              element: 'Container',
              level: 'Novice',
              section: 'A',
              trials: { trial_date: '2025-01-20', trial_number: 1 },
            },
          },
        ];

        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockData,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchEntriesByArmbandFromDatabase(101, 'TEST-KEY');

        expect(result).toHaveLength(2);
        expect(supabase.from).toHaveBeenCalledWith('entries');
      });

      it('should return empty array when armband not found', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        const result = await fetchEntriesByArmbandFromDatabase(999, 'TEST-KEY');

        expect(result).toEqual([]);
      });
    });

    describe('Error Cases', () => {
      it('should throw error when database query fails', async () => {
        const mockFrom = vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        });

        vi.mocked(supabase.from).mockImplementation(mockFrom);

        await expect(
          fetchEntriesByArmbandFromDatabase(101, 'TEST-KEY')
        ).rejects.toThrow('Database error');
      });
    });
  });
});
