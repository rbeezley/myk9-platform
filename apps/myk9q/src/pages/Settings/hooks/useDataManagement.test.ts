/**
 * Tests for useDataManagement Hook
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { useDataManagement } from './useDataManagement';
import * as dataExportService from '@/services/dataExportService';
import * as settingsHelpers from '../utils/settingsHelpers';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock the services
vi.mock('@/services/dataExportService');
vi.mock('../utils/settingsHelpers');
vi.mock('@/stores/settingsStore');

// Mock storage usage
const mockStorageUsage = {
  estimated: 500000,
  quota: 10000000,
  percentUsed: 5,
  localStorageSize: 100000,
};

describe('useDataManagement', () => {
  let mockShowToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShowToast = vi.fn();

    // Default mock implementations
    vi.mocked(dataExportService.getStorageUsage).mockResolvedValue(mockStorageUsage);
    vi.mocked(settingsHelpers.exportPersonalDataHelper).mockResolvedValue();
    vi.mocked(settingsHelpers.exportSettingsToFile).mockResolvedValue();
    vi.mocked(settingsHelpers.importSettingsFromFile).mockResolvedValue();
    vi.mocked(settingsHelpers.clearAllDataHelper).mockResolvedValue(mockStorageUsage);

    vi.mocked(useSettingsStore).mockReturnValue({
      exportSettings: vi.fn(),
      importSettings: vi.fn(),
      settings: {} as any,
      updateSettings: vi.fn(),
      resetSettings: vi.fn(),
    });
  });

  describe('Initialization', () => {
    it('should initialize with null storage usage', () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      expect(result.current.storageUsage).toBe(null);
      expect(result.current.isClearing).toBe(false);
    });

    it('should load storage usage on mount', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await waitFor(() => {
        expect(result.current.storageUsage).toEqual(mockStorageUsage);
      });

      // Note: May be called multiple times due to React Strict Mode in test environment
      expect(dataExportService.getStorageUsage).toHaveBeenCalled();
      expect(result.current.storageUsage).toEqual(mockStorageUsage);
    });

    it('should provide all required methods', () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      expect(typeof result.current.handleExportData).toBe('function');
      expect(typeof result.current.handleExportSettings).toBe('function');
      expect(typeof result.current.handleImportClick).toBe('function');
      expect(typeof result.current.handleImportFile).toBe('function');
      expect(typeof result.current.handleClearData).toBe('function');
      expect(typeof result.current.refreshStorageUsage).toBe('function');
    });

    it('should provide file input ref', () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      expect(result.current.fileInputRef).toBeDefined();
      expect(result.current.fileInputRef.current).toBe(null); // Not mounted yet
    });
  });

  describe('Storage usage tracking', () => {
    it('should refresh storage usage manually', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      // Wait for initial mount effect to complete
      await waitFor(() => {
        expect(result.current.storageUsage).toEqual(mockStorageUsage);
      });

      // Clear initial calls
      vi.mocked(dataExportService.getStorageUsage).mockClear();

      await act(async () => {
        await result.current.refreshStorageUsage();
      });

      expect(dataExportService.getStorageUsage).toHaveBeenCalledTimes(1);
      expect(result.current.storageUsage).toEqual(mockStorageUsage);
    });

    it('should handle storage usage errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(dataExportService.getStorageUsage).mockRejectedValue(new Error('Storage API error'));

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      expect(result.current.storageUsage).toBe(null);

      consoleErrorSpy.mockRestore();
    });

    it('should update storage usage after clearing data', async () => {
      const updatedUsage = { ...mockStorageUsage, estimated: 100000, percentUsed: 1 };
      vi.mocked(settingsHelpers.clearAllDataHelper).mockResolvedValue(updatedUsage);

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleClearData();
      });

      expect(result.current.storageUsage).toEqual(updatedUsage);
    });
  });

  describe('Export data operations', () => {
    it('should export personal data successfully', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleExportData();
      });

      expect(settingsHelpers.exportPersonalDataHelper).toHaveBeenCalledWith(mockShowToast);
    });

    it('should handle export data errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(settingsHelpers.exportPersonalDataHelper).mockRejectedValue(new Error('Export failed'));

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleExportData();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Failed to export data', 'error');

      consoleErrorSpy.mockRestore();
    });

    it('should export settings successfully', async () => {
      const mockExportSettings = vi.fn();
      vi.mocked(useSettingsStore).mockReturnValue({
        exportSettings: mockExportSettings,
        importSettings: vi.fn(),
        settings: {} as any,
        updateSettings: vi.fn(),
        resetSettings: vi.fn(),
      });

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleExportSettings();
      });

      expect(settingsHelpers.exportSettingsToFile).toHaveBeenCalledWith(
        mockExportSettings,
        mockShowToast
      );
    });

    it('should handle export settings errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(settingsHelpers.exportSettingsToFile).mockRejectedValue(new Error('Export failed'));

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleExportSettings();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Failed to export settings', 'error');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Import operations', () => {
    it('should trigger file input click', () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      // Mock the file input
      const mockClick = vi.fn();
      Object.defineProperty(result.current.fileInputRef, 'current', {
        value: { click: mockClick },
        writable: true,
      });

      act(() => {
        result.current.handleImportClick();
      });

      expect(mockClick).toHaveBeenCalledTimes(1);
    });

    it('should import settings from file', async () => {
      const mockImportSettings = vi.fn();
      vi.mocked(useSettingsStore).mockReturnValue({
        exportSettings: vi.fn(),
        importSettings: mockImportSettings,
        settings: {} as any,
        updateSettings: vi.fn(),
        resetSettings: vi.fn(),
      });

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' });
      const mockEvent = {
        target: { files: [mockFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleImportFile(mockEvent);
      });

      expect(settingsHelpers.importSettingsFromFile).toHaveBeenCalledWith(
        mockFile,
        mockImportSettings,
        mockShowToast,
        result.current.fileInputRef
      );
    });

    it('should handle no file selected', async () => {
      // Reset mocks from previous test
      vi.mocked(settingsHelpers.importSettingsFromFile).mockClear();
      vi.mocked(useSettingsStore).mockReturnValue({
        exportSettings: vi.fn(),
        importSettings: vi.fn(),
        settings: {} as any,
        updateSettings: vi.fn(),
        resetSettings: vi.fn(),
      });

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      // Create event with null file (user cancelled file picker)
      const mockEvent = {
        target: { files: null },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleImportFile(mockEvent);
      });

      expect(settingsHelpers.importSettingsFromFile).not.toHaveBeenCalled();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('should handle import errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(settingsHelpers.importSettingsFromFile).mockRejectedValue(new Error('Import failed'));

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      const mockFile = new File(['{}'], 'settings.json', { type: 'application/json' });
      const mockEvent = {
        target: { files: [mockFile] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;

      await act(async () => {
        await result.current.handleImportFile(mockEvent);
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Failed to import settings', 'error');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Clear data operations', () => {
    it('should clear data with default options', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      expect(result.current.isClearing).toBe(false);

      await act(async () => {
        await result.current.handleClearData();
      });

      expect(settingsHelpers.clearAllDataHelper).toHaveBeenCalledWith(mockShowToast, {
        keepAuth: true,
        keepSettings: false,
        keepFavorites: false,
      });

      expect(result.current.isClearing).toBe(false);
    });

    it('should set isClearing state during operation', async () => {
      let wasClearingDuringOperation = false;

      vi.mocked(settingsHelpers.clearAllDataHelper).mockImplementation(async (showToast, options) => {
        // Delay to allow checking state
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockStorageUsage;
      });

      const { result, rerender } = renderHook(() => useDataManagement(mockShowToast));

      expect(result.current.isClearing).toBe(false);

      // Start the async operation
      const clearPromise = result.current.handleClearData();

      // Poll for state change
      await waitFor(() => {
        rerender();
        if (result.current.isClearing) {
          wasClearingDuringOperation = true;
        }
        return wasClearingDuringOperation;
      }, { timeout: 500, interval: 5 });

      // Wait for completion
      await act(async () => {
        await clearPromise;
      });

      expect(wasClearingDuringOperation).toBe(true);
      expect(result.current.isClearing).toBe(false);
    });

    it('should clear data with custom options', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleClearData({
          keepAuth: true,
          keepSettings: true,
          keepFavorites: true,
        });
      });

      expect(settingsHelpers.clearAllDataHelper).toHaveBeenCalledWith(mockShowToast, {
        keepAuth: true,
        keepSettings: true,
        keepFavorites: true,
      });
    });

    it('should handle clear data errors', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(settingsHelpers.clearAllDataHelper).mockRejectedValue(new Error('Clear failed'));

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      await act(async () => {
        await result.current.handleClearData();
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Failed to clear data', 'error');
      expect(result.current.isClearing).toBe(false);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle complete data management workflow', async () => {
      const { result } = renderHook(() => useDataManagement(mockShowToast));

      // 1. Wait for initial storage load
      await waitFor(() => {
        expect(result.current.storageUsage).toEqual(mockStorageUsage);
      });

      // 2. Export data
      await act(async () => {
        await result.current.handleExportData();
      });
      expect(settingsHelpers.exportPersonalDataHelper).toHaveBeenCalled();

      // 3. Export settings
      await act(async () => {
        await result.current.handleExportSettings();
      });
      expect(settingsHelpers.exportSettingsToFile).toHaveBeenCalled();

      // 4. Clear data
      const updatedUsage = { ...mockStorageUsage, estimated: 50000, percentUsed: 0.5 };
      vi.mocked(settingsHelpers.clearAllDataHelper).mockResolvedValue(updatedUsage);

      await act(async () => {
        await result.current.handleClearData({ keepAuth: true });
      });

      expect(result.current.storageUsage).toEqual(updatedUsage);
    });

    it('should recover from errors and continue working', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(() => useDataManagement(mockShowToast));

      // Wait for initial mount effects to complete
      await waitFor(() => {
        expect(result.current.storageUsage).toEqual(mockStorageUsage);
      });

      // Clear any previous calls
      vi.mocked(settingsHelpers.exportPersonalDataHelper).mockClear();
      mockShowToast.mockClear();

      // First export fails
      vi.mocked(settingsHelpers.exportPersonalDataHelper).mockRejectedValueOnce(new Error('Network error'));

      await act(async () => {
        await result.current.handleExportData();
      });
      expect(mockShowToast).toHaveBeenCalledWith('Failed to export data', 'error');

      // Second export succeeds
      vi.mocked(settingsHelpers.exportPersonalDataHelper).mockResolvedValueOnce();

      await act(async () => {
        await result.current.handleExportData();
      });
      expect(settingsHelpers.exportPersonalDataHelper).toHaveBeenCalledTimes(2);

      consoleErrorSpy.mockRestore();
    });
  });
});
