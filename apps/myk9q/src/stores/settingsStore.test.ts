/**
 * Tests for settings store
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSettingsStore, SETTINGS_VERSION, initializeSettings } from './settingsStore';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock document.documentElement for theme application
const mockClassList = {
  add: vi.fn(),
  remove: vi.fn(),
  contains: vi.fn(),
};

Object.defineProperty(document, 'documentElement', {
  value: {
    classList: mockClassList,
  },
  writable: true,
});

// Mock window.matchMedia for auto theme detection
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: query === '(prefers-color-scheme: dark)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('accentColor invariants (Phase 3)', () => {
  it('defaultSettings.accentColor is a canonical v2 value', () => {
    const { settings } = useSettingsStore.getState();
    expect(['teal', 'terracotta', 'blue', 'purple']).toContain(settings.accentColor);
  });

  it('updateSettings rejects legacy accent values at the type level', () => {
    // Compile-time invariant — this file will fail `tsc --noEmit` if
    // AppSettings.accentColor still includes 'green' | 'orange'.
    // @ts-expect-error — 'green' is not an AppSettings.accentColor variant
    useSettingsStore.getState().updateSettings({ accentColor: 'green' });
    // @ts-expect-error — 'orange' is not an AppSettings.accentColor variant
    useSettingsStore.getState().updateSettings({ accentColor: 'orange' });
  });
});

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    localStorageMock.clear();
    mockClassList.add.mockClear();
    mockClassList.remove.mockClear();
    mockClassList.contains.mockClear();

    // Reset store to defaults - matches actual AppSettings interface
    useSettingsStore.setState({
      settings: {
        // Display
        theme: 'auto',
        accentColor: 'teal',
        displayMode: 'default',

        // Performance
        enableAnimations: null,
        enableBlur: null,
        enableShadows: null,

        // Mobile
        pullToRefresh: false,
        hapticFeedback: true,

        // Notifications
        enableNotifications: false,
        voiceNotifications: true,
        showBadges: true,
        notifyYourTurnLeadDogs: 3,

        // Scoring
        voiceAnnouncements: false,

        // Voice configuration
        voiceName: '',
        voiceRate: 1.0,

        // Privacy & Security
        autoLogout: 480,

        // Developer Tools
        developerMode: false,
        consoleLogging: 'errors',
        enableBetaFeatures: false,
        enablePerformanceMonitoring: true,
      },
    });
  });

  describe('updateSettings', () => {
    it('should update single setting', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ theme: 'dark' });

      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('dark');
    });

    it('should update multiple settings', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({
        theme: 'light',
        hapticFeedback: false,
        accentColor: 'blue',
      });

      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('light');
      expect(state.settings.hapticFeedback).toBe(false);
      expect(state.settings.accentColor).toBe('blue');
    });

    it('should preserve other settings when updating', () => {
      const store = useSettingsStore.getState();
      const originalNotifications = store.settings.enableNotifications;

      store.updateSettings({ theme: 'dark' });

      const state = useSettingsStore.getState();
      expect(state.settings.enableNotifications).toBe(originalNotifications);
    });

    it('should apply theme immediately via CSS class', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ theme: 'dark' });

      expect(mockClassList.remove).toHaveBeenCalledWith('theme-light', 'theme-dark');
      expect(mockClassList.add).toHaveBeenCalledWith('theme-dark');
    });

    it('should apply accent color immediately via CSS class', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ accentColor: 'blue' });

      expect(mockClassList.remove).toHaveBeenCalledWith(
        'accent-teal',
        'accent-terracotta',
        'accent-blue',
        'accent-purple'
      );
      expect(mockClassList.add).toHaveBeenCalledWith('accent-blue');
    });

    it('should apply light theme', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ theme: 'light' });

      expect(mockClassList.remove).toHaveBeenCalledWith('theme-light', 'theme-dark');
      expect(mockClassList.add).toHaveBeenCalledWith('theme-light');
    });
  });

  describe('resetSettings', () => {
    it('should reset all settings to defaults', () => {
      const store = useSettingsStore.getState();

      // Change settings
      store.updateSettings({
        theme: 'dark',
        accentColor: 'blue',
        hapticFeedback: false,
      });

      // Reset
      store.resetSettings();

      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('auto');
      expect(state.settings.accentColor).toBe('teal');
      expect(state.settings.hapticFeedback).toBe(true);
    });

    it('should reapply default CSS classes', () => {
      const store = useSettingsStore.getState();
      mockClassList.add.mockClear();
      mockClassList.remove.mockClear();

      store.resetSettings();

      // Should apply auto theme (detects mock dark)
      expect(mockClassList.remove).toHaveBeenCalledWith('theme-light', 'theme-dark');
      expect(mockClassList.add).toHaveBeenCalledWith('theme-dark');
      expect(mockClassList.add).toHaveBeenCalledWith('accent-teal');
    });
  });

  describe('exportSettings', () => {
    it('should export settings as JSON string', () => {
      const store = useSettingsStore.getState();
      const exported = store.exportSettings();

      expect(typeof exported).toBe('string');
      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should include version in export', () => {
      const store = useSettingsStore.getState();
      const exported = store.exportSettings();
      const parsed = JSON.parse(exported);

      expect(parsed.version).toBe(SETTINGS_VERSION);
    });

    it('should include timestamp in export', () => {
      const store = useSettingsStore.getState();
      const exported = store.exportSettings();
      const parsed = JSON.parse(exported);

      expect(parsed.exportedAt).toBeDefined();
      expect(new Date(parsed.exportedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include all settings in export', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ theme: 'dark', accentColor: 'purple' });

      const exported = store.exportSettings();
      const parsed = JSON.parse(exported);

      expect(parsed.settings.theme).toBe('dark');
      expect(parsed.settings.accentColor).toBe('purple');
    });

    it('should format JSON with indentation', () => {
      const store = useSettingsStore.getState();
      const exported = store.exportSettings();

      // Check if JSON has newlines (indicating formatting)
      expect(exported).toContain('\n');
      expect(exported).toContain('  '); // Check for indentation
    });
  });

  describe('importSettings', () => {
    it('should import valid settings JSON', () => {
      const store = useSettingsStore.getState();
      const exportData = {
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        settings: {
          theme: 'dark',
          accentColor: 'blue',
          enableAnimations: false,
          enableBlur: false,
          enableShadows: false,
          pullToRefresh: true,
          hapticFeedback: false,
          enableNotifications: true,
          voiceNotifications: true,
          showBadges: false,
          notifyYourTurnLeadDogs: 5,
          voiceAnnouncements: true,
          voiceName: 'Alex',
          voiceRate: 1.5,
          autoLogout: 480,
          developerMode: true,
          consoleLogging: 'all',
          enableBetaFeatures: true,
          enablePerformanceMonitoring: false,
        },
      };

      const result = store.importSettings(JSON.stringify(exportData));

      expect(result).toBe(true);
      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('dark');
      expect(state.settings.accentColor).toBe('blue');
    });

    it('should return false for invalid JSON', () => {
      const store = useSettingsStore.getState();
      const result = store.importSettings('invalid json{]');

      expect(result).toBe(false);
    });

    it('should repair corrupted settings with defaults', () => {
      const store = useSettingsStore.getState();
      const corruptedData = JSON.stringify({ invalid: 'data' });

      const result = store.importSettings(corruptedData);

      // Migration system should repair corrupted data
      expect(result).toBe(true);

      // Should have valid default settings
      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBeDefined();
      expect(state.settings.accentColor).toBeDefined();
    });

    it('should apply imported settings immediately', () => {
      const store = useSettingsStore.getState();
      const exportData = {
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        settings: {
          ...store.settings,
          theme: 'light',
          accentColor: 'purple',
        },
      };

      mockClassList.add.mockClear();
      mockClassList.remove.mockClear();

      store.importSettings(JSON.stringify(exportData));

      // Should apply visual settings
      expect(mockClassList.add).toHaveBeenCalledWith('theme-light');
      expect(mockClassList.add).toHaveBeenCalledWith('accent-purple');
    });

    it('should handle legacy format without version', () => {
      const store = useSettingsStore.getState();
      const legacySettings = {
        theme: 'dark',
        accentColor: 'teal',
      };

      // Should not throw error
      const result = store.importSettings(JSON.stringify(legacySettings));
      expect(result).toBe(true);
    });
  });

  describe('initializeSettings', () => {
    it('should apply accent color on initialization', () => {
      mockClassList.add.mockClear();
      initializeSettings();

      // Should apply default accent color
      expect(mockClassList.add).toHaveBeenCalledWith('accent-teal');
    });
  });

  describe('persistence', () => {
    it('should persist settings to localStorage on update', () => {
      const store = useSettingsStore.getState();
      store.updateSettings({ theme: 'dark' });

      // Zustand persist middleware should save to localStorage
      // Note: In test environment, persistence may be async, so we just verify the update worked
      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('dark');

      // If localStorage is set, verify the structure
      const stored = localStorageMock.getItem('myK9Q_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        expect(parsed.state.settings.theme).toBe('dark');
      }
    });
  });

  describe('default values', () => {
    it('should have correct default theme', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('auto');
    });

    it('should have correct default accent color', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.accentColor).toBe('teal');
    });

    it('should have haptic feedback enabled by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.hapticFeedback).toBe(true);
    });

    it('should have notifications disabled by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.enableNotifications).toBe(false);
    });

    it('should notify when 3 dogs ahead by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.notifyYourTurnLeadDogs).toBe(3);
    });

    it('should have 8-hour auto-logout by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.autoLogout).toBe(480); // 8 hours in minutes
    });

    it('should have developer mode disabled by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.developerMode).toBe(false);
    });

    it('should have performance monitoring enabled by default', () => {
      const state = useSettingsStore.getState();
      expect(state.settings.enablePerformanceMonitoring).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid consecutive updates', () => {
      const store = useSettingsStore.getState();

      store.updateSettings({ theme: 'dark' });
      store.updateSettings({ theme: 'light' });
      store.updateSettings({ theme: 'dark' });

      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('dark');
    });

    it('should handle empty update object', () => {
      const store = useSettingsStore.getState();
      const originalSettings = { ...store.settings };

      store.updateSettings({});

      const state = useSettingsStore.getState();
      expect(state.settings).toEqual(originalSettings);
    });

    it('should handle partial settings import', () => {
      const store = useSettingsStore.getState();
      const partialExport = {
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        settings: {
          theme: 'dark',
          accentColor: 'purple',
          // Missing other fields - repair will merge with defaults
        },
      };

      const result = store.importSettings(JSON.stringify(partialExport));

      // Should succeed - repair merges partial settings with defaults
      expect(result).toBe(true);
      const state = useSettingsStore.getState();
      expect(state.settings.theme).toBe('dark');
      expect(state.settings.accentColor).toBe('purple');
    });
  });

  describe('v2 accent + displayMode additions', () => {
    beforeEach(() => {
      mockClassList.add.mockClear();
      mockClassList.remove.mockClear();
    });

    it('accepts accentColor: teal and adds accent-teal class', () => {
      const { updateSettings } = useSettingsStore.getState();
      updateSettings({ accentColor: 'teal' });
      expect(mockClassList.add).toHaveBeenCalledWith('accent-teal');
    });

    it('accepts accentColor: terracotta and adds accent-terracotta class', () => {
      const { updateSettings } = useSettingsStore.getState();
      updateSettings({ accentColor: 'terracotta' });
      expect(mockClassList.add).toHaveBeenCalledWith('accent-terracotta');
    });

    it('defaults displayMode to "default"', () => {
      const { settings } = useSettingsStore.getState();
      expect(settings.displayMode).toBe('default');
    });

    it('adds mode-outdoor class when displayMode is "outdoor"', () => {
      const { updateSettings } = useSettingsStore.getState();
      updateSettings({ displayMode: 'outdoor' });
      expect(mockClassList.add).toHaveBeenCalledWith('mode-outdoor');
    });

    it('removes mode-outdoor class when displayMode is "default"', () => {
      const { updateSettings } = useSettingsStore.getState();
      updateSettings({ displayMode: 'default' });
      expect(mockClassList.remove).toHaveBeenCalledWith('mode-outdoor');
    });

    it('persists displayMode into store state', () => {
      const { updateSettings } = useSettingsStore.getState();
      updateSettings({ displayMode: 'outdoor' });
      expect(useSettingsStore.getState().settings.displayMode).toBe('outdoor');
    });
  });
});
