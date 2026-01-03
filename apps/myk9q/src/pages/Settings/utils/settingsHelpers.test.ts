/**
 * Unit Tests for Settings Helper Utilities
 */

import { vi } from 'vitest';
import {
  exportPersonalDataHelper,
  clearAllDataHelper,
  exportSettingsToFile,
  importSettingsFromFile,
  resetOnboarding,
  reloadPage
} from './settingsHelpers';

// Mock the dependencies
vi.mock('@/services/dataExportService', () => ({
  exportPersonalData: vi.fn().mockResolvedValue(undefined),
  clearAllData: vi.fn().mockResolvedValue(undefined),
  getStorageUsage: vi.fn().mockResolvedValue({
    estimated: 1000,
    quota: 10000,
    percentUsed: 10,
    localStorageSize: 500
  })
}));

describe('exportPersonalDataHelper', () => {
  test('should export data and show success toast', async () => {
    const showToast = vi.fn();

    await exportPersonalDataHelper(showToast);

    expect(showToast).toHaveBeenCalledWith('Your data has been exported successfully!');
  });
});

describe('clearAllDataHelper', () => {
  test('should clear data and return storage usage', async () => {
    const showToast = vi.fn();

    const usage = await clearAllDataHelper(showToast);

    expect(showToast).toHaveBeenCalledWith(
      'All data cleared successfully! You remain logged in.',
      'success'
    );
    expect(usage).toHaveProperty('estimated');
    expect(usage).toHaveProperty('quota');
  });
});

describe('exportSettingsToFile', () => {
  test('should create download link and show toast', () => {
    const mockExportSettings = vi.fn().mockReturnValue('{"theme":"dark"}');
    const showToast = vi.fn();

    // Mock DOM methods
    const mockLink = {
      click: vi.fn(),
      href: '',
      download: ''
    };
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
    const removeChild = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

    exportSettingsToFile(mockExportSettings, showToast);

    expect(mockExportSettings).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Settings exported successfully!');
    expect(mockLink.click).toHaveBeenCalled();

    createElement.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});

describe('importSettingsFromFile', () => {
  test('should import valid settings file', async () => {
    const mockFile = {
      text: vi.fn().mockResolvedValue('{"theme":"dark"}')
    } as any;
    const mockImportSettings = vi.fn().mockReturnValue(true);
    const showToast = vi.fn();

    const result = await importSettingsFromFile(mockFile, mockImportSettings, showToast);

    expect(result).toBe(true);
    expect(mockImportSettings).toHaveBeenCalledWith('{"theme":"dark"}');
    expect(showToast).toHaveBeenCalledWith('Settings imported successfully!');
  });

  test('should handle invalid settings file', async () => {
    const mockFile = {
      text: vi.fn().mockResolvedValue('invalid')
    } as any;
    const mockImportSettings = vi.fn().mockReturnValue(false);
    const showToast = vi.fn();

    const result = await importSettingsFromFile(mockFile, mockImportSettings, showToast);

    expect(result).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      'Failed to import settings - invalid file format',
      'error'
    );
  });
});

describe('resetOnboarding', () => {
  test('should remove onboarding flag and schedule reload', () => {
    const showToast = vi.fn();
    const removeItemSpy = vi.fn();
    const originalRemoveItem = localStorage.removeItem;
    localStorage.removeItem = removeItemSpy;

    // Mock window.location.reload
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error - mocking location
    window.location = { ...originalLocation, reload: reloadSpy };

    vi.useFakeTimers();

    resetOnboarding(showToast, 100);

    expect(removeItemSpy).toHaveBeenCalledWith('onboarding_completed');
    expect(showToast).toHaveBeenCalledWith(
      'Onboarding will show when you refresh or reopen the app',
      'info'
    );

    vi.advanceTimersByTime(100);
    expect(reloadSpy).toHaveBeenCalled();

    vi.useRealTimers();
    localStorage.removeItem = originalRemoveItem;
    // @ts-expect-error - restoring location
    window.location = originalLocation;
  });
});

describe('reloadPage', () => {
  test('should call window.location.reload', () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error - mocking location
    window.location = { ...originalLocation, reload: reloadSpy };

    reloadPage();

    expect(reloadSpy).toHaveBeenCalled();

    // @ts-expect-error - restoring location
    window.location = originalLocation;
  });
});
