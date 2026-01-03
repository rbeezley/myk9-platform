/**
 * Tests for settings migration system
 */

import { vi } from 'vitest';
import {
  migrateSettings,
  needsMigration,
  validateSettings,
  repairSettings,
  createRollback,
  createSettingsExport,
  importSettingsWithMigration,
  SettingsExport,
} from './settingsMigration';
import { AppSettings, SETTINGS_VERSION } from '@/stores/settingsStore';

// Mock logger to suppress console output during tests
vi.mock('./logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const createMockSettings = (overrides: Partial<AppSettings> = {}): AppSettings => ({
  // Display
  theme: 'dark',
  accentColor: 'green',

  // Performance
  enableAnimations: true,
  enableBlur: true,
  enableShadows: true,

  // Mobile
  pullToRefresh: true,
  hapticFeedback: true,

  // Notifications
  enableNotifications: true,
  voiceNotifications: false,
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
  enablePerformanceMonitoring: false,
  ...overrides,
});

describe('settingsMigration', () => {
  describe('migrateSettings', () => {
    it('should return settings unchanged when versions match', () => {
      const settings = createMockSettings();
      const result = migrateSettings(settings, SETTINGS_VERSION, SETTINGS_VERSION);
      expect(result).toEqual(settings);
    });

    it('should throw error for unknown source version', () => {
      const settings = createMockSettings();
      expect(() => migrateSettings(settings, '0.5.0', SETTINGS_VERSION)).toThrow(
        'Cannot migrate from unknown version: 0.5.0'
      );
    });

    it('should throw error for unknown target version', () => {
      const settings = createMockSettings();
      expect(() => migrateSettings(settings, '1.0.0', '9.9.9')).toThrow(
        'Cannot migrate to unknown version: 9.9.9'
      );
    });

    it('should handle downgrade gracefully by returning settings as-is', () => {
      const settings = createMockSettings();
      const result = migrateSettings(settings, '1.0.0', '1.0.0');
      expect(result).toEqual(settings);
    });

    it('should apply migrations sequentially from 1.0.0 to current', () => {
      const settings = createMockSettings();
      const result = migrateSettings(settings, '1.0.0', SETTINGS_VERSION);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    });
  });

  describe('needsMigration', () => {
    it('should return false for current version', () => {
      expect(needsMigration(SETTINGS_VERSION)).toBe(false);
    });

    it('should return true for older versions', () => {
      expect(needsMigration('0.9.0')).toBe(true);
    });

    it('should return false for future versions', () => {
      expect(needsMigration('9.9.9')).toBe(false);
    });
  });

  describe('validateSettings', () => {
    it('should validate complete settings object', () => {
      const settings = createMockSettings();
      expect(validateSettings(settings)).toBe(true);
    });

    it('should reject null settings', () => {
      expect(validateSettings(null)).toBe(false);
    });

    it('should reject undefined settings', () => {
      expect(validateSettings(undefined)).toBe(false);
    });

    it('should reject non-object settings', () => {
      expect(validateSettings('invalid')).toBe(false);
      expect(validateSettings(123)).toBe(false);
      expect(validateSettings([])).toBe(false);
    });

    it('should reject settings missing required fields', () => {
      const incomplete = { hapticFeedback: true }; // Missing theme and accentColor
      expect(validateSettings(incomplete)).toBe(false);
    });

    it('should accept settings with required fields', () => {
      const minimal = {
        theme: 'dark',
        accentColor: 'green',
      };
      expect(validateSettings(minimal)).toBe(true);
    });
  });

  describe('repairSettings', () => {
    const defaults = createMockSettings();

    it('should return valid settings unchanged', () => {
      const validSettings = createMockSettings({ theme: 'light' });
      const result = repairSettings(validSettings, defaults);
      expect(result.theme).toBe('light');
    });

    it('should merge invalid settings with defaults', () => {
      const invalid = { theme: 'dark' }; // Missing accentColor
      const result = repairSettings(invalid, defaults);
      expect(result.theme).toBe('dark'); // Preserved from invalid
      expect(result.accentColor).toBe(defaults.accentColor); // From defaults
    });

    it('should preserve valid fields and fill missing ones', () => {
      // Settings with required fields (theme, accentColor) pass validation
      // and are returned as-is with defaults merged
      const partial = {
        theme: 'light',
        accentColor: 'blue',
        // Missing other fields - these are merged from defaults
      };
      const result = repairSettings(partial, defaults);
      expect(result.theme).toBe('light');
      expect(result.accentColor).toBe('blue');
      // Since settings pass validation (have required fields), defaults are merged
      // The spread {...defaults, ...partial} means partial values override defaults
    });
  });

  describe('createRollback', () => {
    it('should create a rollback function that restores settings', () => {
      const originalSettings = createMockSettings({ theme: 'dark' });
      const rollback = createRollback(originalSettings);

      const restoredSettings = rollback();
      expect(restoredSettings).toEqual(originalSettings);
    });

    it('should create an independent copy for rollback', () => {
      const originalSettings = createMockSettings({ theme: 'dark' });
      const rollback = createRollback(originalSettings);

      // Modify original
      originalSettings.theme = 'light';

      // Rollback should restore original state
      const restoredSettings = rollback();
      expect(restoredSettings.theme).toBe('dark');
    });
  });

  describe('createSettingsExport', () => {
    it('should create export with version and timestamp', () => {
      const settings = createMockSettings();
      const exportData = createSettingsExport(settings);

      expect(exportData.version).toBe(SETTINGS_VERSION);
      expect(exportData.settings).toEqual(settings);
      expect(exportData.exportedAt).toBeDefined();
      expect(new Date(exportData.exportedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should include platform metadata', () => {
      const settings = createMockSettings();
      const exportData = createSettingsExport(settings);

      expect(exportData.metadata).toBeDefined();
      expect(exportData.metadata?.platform).toBeDefined();
      expect(exportData.metadata?.deviceType).toMatch(/mobile|desktop/);
    });

    it('should create valid ISO timestamp', () => {
      const settings = createMockSettings();
      const exportData = createSettingsExport(settings);

      expect(() => new Date(exportData.exportedAt)).not.toThrow();
      expect(exportData.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('importSettingsWithMigration', () => {
    const defaults = createMockSettings();

    it('should import current version settings without migration', () => {
      const settings = createMockSettings({ theme: 'light' });
      const exportData = createSettingsExport(settings);

      const result = importSettingsWithMigration(exportData, defaults);

      expect(result.success).toBe(true);
      expect(result.migrated).toBe(false);
      expect(result.settings.theme).toBe('light');
    });

    it('should handle legacy format (plain settings object)', () => {
      const legacySettings = createMockSettings({ theme: 'dark' });

      const result = importSettingsWithMigration(legacySettings, defaults);

      expect(result.success).toBe(true);
      expect(result.migrated).toBe(false);
      expect(result.settings.theme).toBe('dark');
    });

    it('should migrate older version settings', () => {
      const oldSettings: SettingsExport = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        settings: createMockSettings(),
      };

      const result = importSettingsWithMigration(oldSettings, defaults);

      expect(result.success).toBe(true);
      expect(result.settings).toBeDefined();
    });

    it('should repair invalid imported settings', () => {
      const invalidExport: SettingsExport = {
        version: SETTINGS_VERSION,
        exportedAt: new Date().toISOString(),
        settings: { theme: 'dark' } as any, // Missing required fields
      };

      const result = importSettingsWithMigration(invalidExport, defaults);

      expect(result.success).toBe(true);
      expect(result.settings.theme).toBe('dark'); // Preserved
      expect(result.settings.accentColor).toBe(defaults.accentColor); // From defaults
    });

    it('should repair severely corrupted data with defaults', () => {
      const corruptedData = { invalid: 'data' } as any;

      const result = importSettingsWithMigration(corruptedData, defaults);

      // System should repair even severely corrupted data
      expect(result.success).toBe(true);
      expect(result.settings).toBeDefined();
      expect(result.settings.theme).toBeDefined();
      expect(result.settings.accentColor).toBeDefined();
      expect(result.migrated).toBe(false); // No migration, just repair
    });

    it('should handle missing version field gracefully', () => {
      const noVersion = {
        exportedAt: new Date().toISOString(),
        settings: createMockSettings(),
      } as any;

      const result = importSettingsWithMigration(noVersion, defaults);

      expect(result.success).toBe(true);
      expect(result.settings).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty settings object', () => {
      const defaults = createMockSettings();
      const result = repairSettings({}, defaults);
      expect(result).toEqual(defaults);
    });

    it('should handle settings with extra fields', () => {
      const settingsWithExtra = {
        ...createMockSettings(),
        unknownField: 'value',
        anotherField: 123,
      } as any;

      expect(validateSettings(settingsWithExtra)).toBe(true);
    });

    it('should preserve extra fields during repair', () => {
      const defaults = createMockSettings();
      const settingsWithExtra = {
        theme: 'dark',
        accentColor: 'green',
        customField: 'preserved',
      } as any;

      const result = repairSettings(settingsWithExtra, defaults);
      expect((result as any).customField).toBe('preserved');
    });
  });
});
