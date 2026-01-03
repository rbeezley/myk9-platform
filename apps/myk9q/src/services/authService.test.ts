import { vi } from 'vitest';
import { authenticatePasscode, getShowByLicenseKey, testDatabaseConnection } from './authService';
import { supabase } from '../lib/supabase';
import * as authUtils from '../utils/auth';

// Mock the supabase client
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}));

// Mock auth utils
vi.mock('../utils/auth', () => ({
  validatePasscodeAgainstLicenseKey: vi.fn()
}));

// Mock fetch to simulate Edge Function unavailable (triggers client-side fallback)
const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
vi.stubGlobal('fetch', mockFetch);

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock to trigger client-side fallback
    mockFetch.mockRejectedValue(new Error('Network error'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe('authenticatePasscode', () => {
    const mockShows = [
      {
        id: 1,
        show_name: 'Test Show 1',
        club_name: 'Test Club',
        license_key: 'myK9Q1-a260f472-e0d76a33-4b6c264c',
        start_date: '2025-01-15',
        organization: 'AKC',
        show_type: 'Regular'
      },
      {
        id: 2,
        show_name: 'Test Show 2',
        club_name: 'Test Club 2',
        license_key: 'myK9Q1-b123f456-e0d76a44-5b7c375d',
        start_date: '2025-02-20',
        organization: 'UKC',
        show_type: 'National'
      }
    ];

    const mockTrials = [
      { id: 101, show_id: 1, trial_name: 'Trial 1', trial_date: '2025-01-15' },
      { id: 102, show_id: 1, trial_name: 'Trial 2', trial_date: '2025-01-16' }
    ];

    const mockClasses = [
      { id: 201, trial_id: 101, class_name: 'Novice A', class_order: 1 },
      { id: 202, trial_id: 101, class_name: 'Advanced B', class_order: 2 }
    ];

    test('should successfully authenticate a valid passcode', async () => {
      // Mock validatePasscodeAgainstLicenseKey to return PasscodeResult for second show
      vi.spyOn(authUtils, 'validatePasscodeAgainstLicenseKey')
        .mockReturnValueOnce(null) // First show fails
        .mockReturnValueOnce({ role: 'judge', licenseKey: 'b123', isValid: true });  // Second show succeeds

      // Mock Supabase queries
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockIn = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockSingle = vi.fn();

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const chain = {
          select: mockSelect,
          eq: mockEq,
          in: mockIn,
          order: mockOrder,
          single: mockSingle
        } as any;

        if (table === 'shows') {
          mockSelect.mockImplementation((fields?: string) => {
            if (fields === '*') {
              mockOrder.mockResolvedValue({ data: mockShows, error: null });
            } else if (fields === 'organization, show_type') {
              mockSingle.mockResolvedValue({
                data: { organization: 'UKC', show_type: 'National' },
                error: null
              });
            }
            return chain;
          });
        } else if (table === 'trials') {
          mockSelect.mockImplementation(() => {
            mockEq.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: mockTrials, error: null });
              return chain;
            });
            return chain;
          });
        } else if (table === 'classes') {
          mockSelect.mockImplementation(() => {
            mockIn.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: mockClasses, error: null });
              return chain;
            });
            return chain;
          });
        }

        return chain;
      });

      const result = await authenticatePasscode('jb123');

      expect(result).not.toBeNull();
      expect(result?.showName).toBe('Test Show 2');
      expect(result?.licenseKey).toBe('myK9Q1-b123f456-e0d76a44-5b7c375d');
      expect(result?.org).toBe('UKC');
      expect(result?.competition_type).toBe('National');
      expect(result?.trials).toEqual(mockTrials);
      expect(result?.classes).toEqual(mockClasses);
    });

    test('should return null when no shows exist', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        order: mockOrder
      } as any);

      const result = await authenticatePasscode('jb123');

      expect(result).toBeNull();
    });

    test('should return null when passcode does not match any show', async () => {
      vi.spyOn(authUtils, 'validatePasscodeAgainstLicenseKey')
        .mockReturnValue(null);

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({ data: mockShows, error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        order: mockOrder
      } as any);

      const result = await authenticatePasscode('invalid');

      expect(result).toBeNull();
      expect(authUtils.validatePasscodeAgainstLicenseKey).toHaveBeenCalledTimes(2);
    });

    test('should return null when database query fails', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        order: mockOrder
      } as any);

      const result = await authenticatePasscode('jb123');

      expect(result).toBeNull();
    });

    test('should handle trial fetch errors gracefully', async () => {
      vi.spyOn(authUtils, 'validatePasscodeAgainstLicenseKey')
        .mockReturnValue({ role: 'admin', licenseKey: 'a260', isValid: true });

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn();
      const mockSingle = vi.fn();

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const chain = {
          select: mockSelect,
          eq: mockEq,
          order: mockOrder,
          single: mockSingle
        } as any;

        if (table === 'shows') {
          mockSelect.mockImplementation((fields?: string) => {
            if (fields === '*') {
              mockOrder.mockResolvedValue({ data: [mockShows[0]], error: null });
            } else if (fields === 'organization, show_type') {
              mockSingle.mockResolvedValue({
                data: { organization: 'AKC', show_type: 'Regular' },
                error: null
              });
            }
            return chain;
          });
        } else if (table === 'trials') {
          mockSelect.mockImplementation(() => {
            mockEq.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: null, error: { message: 'Trial error' } });
              return chain;
            });
            return chain;
          });
        }

        return chain;
      });

      const result = await authenticatePasscode('aa260');

      expect(result).not.toBeNull();
      expect(result?.trials).toEqual([]);
      expect(result?.classes).toEqual([]);
    });

    test('should handle empty trials array', async () => {
      vi.spyOn(authUtils, 'validatePasscodeAgainstLicenseKey')
        .mockReturnValue({ role: 'admin', licenseKey: 'a260', isValid: true });

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn();
      const mockSingle = vi.fn();

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const chain = {
          select: mockSelect,
          eq: mockEq,
          order: mockOrder,
          single: mockSingle
        } as any;

        if (table === 'shows') {
          mockSelect.mockImplementation((fields?: string) => {
            if (fields === '*') {
              mockOrder.mockResolvedValue({ data: [mockShows[0]], error: null });
            } else if (fields === 'organization, show_type') {
              mockSingle.mockResolvedValue({
                data: { organization: 'AKC', show_type: 'Regular' },
                error: null
              });
            }
            return chain;
          });
        } else if (table === 'trials') {
          mockSelect.mockImplementation(() => {
            mockEq.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: [], error: null });
              return chain;
            });
            return chain;
          });
        }

        return chain;
      });

      const result = await authenticatePasscode('aa260');

      expect(result).not.toBeNull();
      expect(result?.trials).toEqual([]);
      expect(result?.classes).toEqual([]);
    });
  });

  describe('getShowByLicenseKey', () => {
    const mockShow = {
      id: 1,
      show_name: 'Test Show',
      club_name: 'Test Club',
      license_key: 'myK9Q1-a260f472-e0d76a33-4b6c264c',
      start_date: '2025-01-15',
      organization: 'AKC',
      show_type: 'Regular'
    };

    const mockTrials = [
      { id: 101, show_id: 1, trial_name: 'Trial 1', trial_date: '2025-01-15' }
    ];

    const mockClasses = [
      { id: 201, trial_id: 101, class_name: 'Novice A', class_order: 1 }
    ];

    test('should retrieve show data by license key', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockIn = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockSingle = vi.fn();

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const chain = {
          select: mockSelect,
          eq: mockEq,
          in: mockIn,
          order: mockOrder,
          single: mockSingle
        } as any;

        if (table === 'shows') {
          mockSelect.mockImplementation((fields: string) => {
            if (fields === '*') {
              mockEq.mockImplementation(() => {
                mockSingle.mockResolvedValue({ data: mockShow, error: null });
                return chain;
              });
            } else if (fields === 'organization, show_type') {
              mockEq.mockImplementation(() => {
                mockSingle.mockResolvedValue({
                  data: { organization: 'AKC', show_type: 'Regular' },
                  error: null
                });
                return chain;
              });
            }
            return chain;
          });
        } else if (table === 'trials') {
          mockSelect.mockImplementation(() => {
            mockEq.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: mockTrials, error: null });
              return chain;
            });
            return chain;
          });
        } else if (table === 'classes') {
          mockSelect.mockImplementation(() => {
            mockIn.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: mockClasses, error: null });
              return chain;
            });
            return chain;
          });
        }

        return chain;
      });

      const result = await getShowByLicenseKey('myK9Q1-a260f472-e0d76a33-4b6c264c');

      expect(result).not.toBeNull();
      expect(result?.showName).toBe('Test Show');
      expect(result?.clubName).toBe('Test Club');
      expect(result?.licenseKey).toBe('myK9Q1-a260f472-e0d76a33-4b6c264c');
      expect(result?.org).toBe('AKC');
      expect(result?.trials).toEqual(mockTrials);
      expect(result?.classes).toEqual(mockClasses);
    });

    test('should return null when show is not found', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const result = await getShowByLicenseKey('invalid-key');

      expect(result).toBeNull();
    });

    test('should handle database errors gracefully', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockSingle = vi.fn().mockRejectedValue(new Error('Database connection error'));

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        eq: mockEq,
        single: mockSingle
      } as any);

      const result = await getShowByLicenseKey('myK9Q1-a260f472-e0d76a33-4b6c264c');

      expect(result).toBeNull();
    });

    test('should use fallback organization from license data', async () => {
      const showWithoutOrg = { ...mockShow, organization: null, show_type: null };

      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockReturnThis();
      const mockOrder = vi.fn().mockReturnThis();
      const mockSingle = vi.fn();

      vi.mocked(supabase.from).mockImplementation((table: string) => {
        const chain = {
          select: mockSelect,
          eq: mockEq,
          order: mockOrder,
          single: mockSingle
        } as any;

        if (table === 'shows') {
          mockSelect.mockImplementation((fields: string) => {
            if (fields === '*') {
              mockEq.mockImplementation(() => {
                mockSingle.mockResolvedValue({ data: showWithoutOrg, error: null });
                return chain;
              });
            } else if (fields === 'organization, show_type') {
              mockEq.mockImplementation(() => {
                mockSingle.mockResolvedValue({
                  data: { organization: 'UKC', show_type: 'National' },
                  error: null
                });
                return chain;
              });
            }
            return chain;
          });
        } else if (table === 'trials') {
          mockSelect.mockImplementation(() => {
            mockEq.mockImplementation(() => {
              mockOrder.mockResolvedValue({ data: [], error: null });
              return chain;
            });
            return chain;
          });
        }

        return chain;
      });

      const result = await getShowByLicenseKey('myK9Q1-a260f472-e0d76a33-4b6c264c');

      expect(result).not.toBeNull();
      expect(result?.org).toBe('UKC');
      expect(result?.competition_type).toBe('National');
    });
  });

  describe('testDatabaseConnection', () => {
    test('should return true when database connection is successful', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue({ data: [{ count: 1 }], error: null });

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        limit: mockLimit
      } as any);

      const result = await testDatabaseConnection();

      expect(result).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith('shows');
    });

    test('should return false when database query returns an error', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Connection failed' }
      } as any);

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        limit: mockLimit
      } as any);

      const result = await testDatabaseConnection();

      expect(result).toBe(false);
    });

    test('should return false when database query throws an exception', async () => {
      const mockFrom = vi.fn().mockReturnThis();
      const mockSelect = vi.fn().mockReturnThis();
      const mockLimit = vi.fn().mockRejectedValue(new Error('Network error'));

      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
        limit: mockLimit
      } as any);

      const result = await testDatabaseConnection();

      expect(result).toBe(false);
    });
  });
});
