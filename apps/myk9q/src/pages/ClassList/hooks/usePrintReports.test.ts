/**
 * Tests for usePrintReports Hook
 */

import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';
import { usePrintReports, type ReportDependencies } from './usePrintReports';
import * as reportService from '@/services/reportService';
import * as entryService from '@/services/entryService';
import * as organizationUtils from '@/utils/organizationUtils';
import type { ClassEntry, TrialInfo } from './useClassListData';
import type { Entry } from '@/stores/entryStore';

// Mock services
vi.mock('@/services/reportService');
vi.mock('@/services/entryService');
vi.mock('@/utils/organizationUtils');

// Sample test data
const mockClasses: ClassEntry[] = [
  {
    id: 1,
    trial_id: 1,
    element: 'Agility',
    level: 'Novice',
    section: 'A',
    class_name: 'Novice A Agility',
    class_order: 1,
    judge_name: 'Judge Smith',
    entry_count: 0,
    completed_count: 0,
    class_status: 'completed',
    is_scoring_finalized: true,
    is_favorite: false,
    trial_date: '2025-01-20',
    trial_number: 1,
    dogs: [],
  } as ClassEntry,
  {
    id: 2,
    trial_id: 1,
    element: 'Jumping',
    level: 'Open',
    section: 'B',
    class_name: 'Open B Jumping',
    class_order: 2,
    judge_name: 'Judge Jones',
    entry_count: 0,
    completed_count: 0,
    class_status: 'in_progress',
    is_scoring_finalized: false,
    is_favorite: false,
    trial_date: '2025-01-20',
    trial_number: 1,
    dogs: [],
  } as ClassEntry,
];

const mockTrialInfo: TrialInfo = {
  trial_name: 'Test Trial',
  trial_date: '2025-01-20',
  trial_number: 1,
  total_classes: 2,
  pending_classes: 1,
  completed_classes: 1,
};

const mockEntries: Entry[] = [
  {
    id: 1,
    armband: '101',
    dog_name: 'Buddy',
    handler_name: 'John Doe',
    isScored: true,
    time: 35.5,
    faults: 0,
  } as Entry,
  {
    id: 2,
    armband: '102',
    dog_name: 'Max',
    handler_name: 'Jane Smith',
    isScored: true,
    time: 38.2,
    faults: 5,
  } as Entry,
  {
    id: 3,
    armband: '103',
    dog_name: 'Bella',
    handler_name: 'Bob Johnson',
    isScored: false,
  } as Entry,
];

const mockOrgData = {
  organization: 'Test Dog Club',
  activity_type: 'AKC Agility'
};

describe('usePrintReports', () => {
  let mockOnComplete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // IMPORTANT: Use resetAllMocks to fully reset mock state (clears calls AND implementations)
    // This prevents async operations from previous tests polluting current test
    vi.resetAllMocks();

    // Create fresh callback mock
    mockOnComplete = vi.fn();

    // Re-apply default mock implementations after reset
    vi.mocked(entryService.getClassEntries).mockResolvedValue(mockEntries);
    vi.mocked(organizationUtils.parseOrganizationData).mockReturnValue(mockOrgData);
    vi.mocked(reportService.generateCheckInSheet).mockReturnValue();
    vi.mocked(reportService.generateResultsSheet).mockReturnValue();
  });

  // Helper to create deps object for tests
  const createDeps = (overrides?: Partial<ReportDependencies>): ReportDependencies => ({
    classes: mockClasses,
    trialInfo: mockTrialInfo,
    licenseKey: 'license-123',
    organization: 'Test Club',
    onComplete: mockOnComplete,
    ...overrides
  });

  afterEach(async () => {
    // Clean up after each test to prevent contamination
    // Flush any pending promises/timers before resetting mocks
    await vi.runOnlyPendingTimersAsync().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 0)); // Flush microtask queue
    vi.resetAllMocks();
    vi.clearAllTimers();
  });

  describe('Initialization', () => {
    it('should provide report generation methods', () => {
      const { result } = renderHook(() => usePrintReports());

      expect(typeof result.current.handleGenerateCheckIn).toBe('function');
      expect(typeof result.current.handleGenerateResults).toBe('function');
    });
  });

  describe('Check-in sheet generation', () => {
    it('should generate check-in sheet successfully', async () => {
      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateCheckIn(1, createDeps());
      });

      expect(reportResult).toEqual({ success: true });
      expect(entryService.getClassEntries).toHaveBeenCalledWith(1, 'license-123');
      expect(reportService.generateCheckInSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          className: 'Novice A Agility',
          element: 'Agility',
          level: 'Novice',
          section: 'A',
          judgeName: 'Judge Smith',
        }),
        mockEntries
      );
      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should handle missing class', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(entryService.getClassEntries).mockClear();
      vi.mocked(mockOnComplete).mockClear();

      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateCheckIn(
          999, // Non-existent class
          createDeps()
        );
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'Class not found'
      });
      expect(entryService.getClassEntries).not.toHaveBeenCalled();
      expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('should handle missing license key', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(entryService.getClassEntries).mockClear();

      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateCheckIn(
          1,
          createDeps({ licenseKey: '' }) // Empty license key
        );
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'License key required'
      });
      expect(entryService.getClassEntries).not.toHaveBeenCalled();
    });

    it('should handle entry fetch errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(entryService.getClassEntries).mockRejectedValue(new Error('Database error'));

      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateCheckIn(1, createDeps());
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'Database error'
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should work without onComplete callback', async () => {
      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateCheckIn(
          1,
          createDeps({ onComplete: undefined }) // No callback
        );
      });

      expect(reportResult).toEqual({ success: true });
      expect(reportService.generateCheckInSheet).toHaveBeenCalled();
    });

    it('should include organization data in report', async () => {
      const { result } = renderHook(() => usePrintReports());

      await act(async () => {
        await result.current.handleGenerateCheckIn(
          1,
          createDeps({ organization: 'Custom Organization' })
        );
      });

      expect(organizationUtils.parseOrganizationData).toHaveBeenCalledWith('Custom Organization');
      expect(reportService.generateCheckInSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: 'Test Dog Club',
          activityType: 'AKC Agility'
        }),
        mockEntries
      );
    });
  });

  describe('Results sheet generation', () => {
    it('should generate results sheet successfully', async () => {
      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateResults(1, createDeps());
      });

      expect(reportResult).toEqual({ success: true });
      expect(entryService.getClassEntries).toHaveBeenCalledWith(1, 'license-123');
      expect(reportService.generateResultsSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          className: 'Novice A Agility',
          judgeName: 'Judge Smith',
        }),
        mockEntries
      );
      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should validate that scored entries exist', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(reportService.generateResultsSheet).mockClear();

      // Mock entries with no scored entries
      vi.mocked(entryService.getClassEntries).mockResolvedValue([
        { id: 1, armband: '101', isScored: false } as Entry,
        { id: 2, armband: '102', isScored: false } as Entry,
      ]);

      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateResults(1, createDeps());
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'No scored entries to display in results sheet'
      });
      expect(reportService.generateResultsSheet).not.toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalled(); // Still calls completion to close popup
    });

    it('should handle missing class', async () => {
      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateResults(999, createDeps());
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'Class not found'
      });
    });

    it('should handle generation errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(reportService.generateResultsSheet).mockImplementation(() => {
        throw new Error('Print error');
      });

      const { result } = renderHook(() => usePrintReports());

      let reportResult;
      await act(async () => {
        reportResult = await result.current.handleGenerateResults(1, createDeps());
      });

      expect(reportResult).toEqual({
        success: false,
        error: 'Print error'
      });
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it('should include trial information in report', async () => {
      const { result } = renderHook(() => usePrintReports());

      await act(async () => {
        await result.current.handleGenerateResults(1, createDeps());
      });

      expect(reportService.generateResultsSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          trialDate: '2025-01-20',
          trialNumber: '1'
        }),
        mockEntries
      );
    });

    it('should handle missing trial info gracefully', async () => {
      const { result } = renderHook(() => usePrintReports());

      await act(async () => {
        await result.current.handleGenerateResults(
          1,
          createDeps({ trialInfo: null }) // No trial info
        );
      });

      expect(reportService.generateResultsSheet).toHaveBeenCalledWith(
        expect.objectContaining({
          trialDate: '',
          trialNumber: ''
        }),
        mockEntries
      );
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete check-in workflow', async () => {
      // Explicitly reset mocks at test start to ensure clean state
      vi.mocked(reportService.generateCheckInSheet).mockClear();
      vi.mocked(mockOnComplete).mockClear();

      const { result } = renderHook(() => usePrintReports());
      const deps = createDeps();

      // 1. Generate check-in sheet
      let result1;
      await act(async () => {
        result1 = await result.current.handleGenerateCheckIn(1, deps);
      });

      expect(result1.success).toBe(true);
      expect(mockOnComplete).toHaveBeenCalledTimes(1);

      // 2. Generate for different class
      await act(async () => {
        await result.current.handleGenerateCheckIn(2, deps);
      });

      expect(mockOnComplete).toHaveBeenCalledTimes(2);
      expect(reportService.generateCheckInSheet).toHaveBeenCalledTimes(2);
    });

    it('should handle complete results workflow', async () => {
      const { result } = renderHook(() => usePrintReports());

      // Generate results sheet
      await act(async () => {
        const result1 = await result.current.handleGenerateResults(1, createDeps());
        expect(result1.success).toBe(true);
      });

      expect(entryService.getClassEntries).toHaveBeenCalled();
      expect(reportService.generateResultsSheet).toHaveBeenCalled();
      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should handle errors and allow retry', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First call fails
      vi.mocked(entryService.getClassEntries).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => usePrintReports());
      const deps = createDeps({ onComplete: undefined });

      let result1;
      await act(async () => {
        result1 = await result.current.handleGenerateCheckIn(1, deps);
      });

      expect(result1.success).toBe(false);

      // Second call succeeds
      vi.mocked(entryService.getClassEntries).mockResolvedValue(mockEntries);

      let result2;
      await act(async () => {
        result2 = await result.current.handleGenerateCheckIn(1, deps);
      });

      expect(result2.success).toBe(true);

      consoleErrorSpy.mockRestore();
    });
  });
});
