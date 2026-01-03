/**
 * Settings Migration System
 *
 * Handles migration of settings between versions.
 * Ensures backward compatibility when settings schema changes.
 */

import { AppSettings, SETTINGS_VERSION } from '@/stores/settingsStore';
import { logger } from './logger';

/**
 * Represents settings in an unknown/pre-migration state
 * Could be from an older version with different schema
 */
type UnvalidatedSettings = Record<string, unknown>;

/**
 * Migration function type
 */
type MigrationFn = (settings: UnvalidatedSettings) => UnvalidatedSettings;

/**
 * Migration definitions
 * Each version defines how to upgrade from the previous version
 */
const migrations: Record<string, MigrationFn> = {
  '1.0.0': (settings: UnvalidatedSettings) => {
    // Initial version - no migration needed
    return settings;
  },

  // Example future migration:
  // '1.1.0': (settings: any) => {
  //   return {
  //     ...settings,
  //     // Add new field with default value
  //     newFeatureEnabled: false,
  //     // Rename old field
  //     performanceMode: settings.performanceLevel || 'auto',
  //   };
  // },

  // Example version 1.2.0 migration:
  // '1.2.0': (settings: any) => {
  //   return {
  //     ...settings,
  //     // Convert old boolean to new enum
  //     notificationMode: settings.enableNotifications ? 'all' : 'none',
  //   };
  // },
};

/**
 * Parse version string into comparable number
 */
function parseVersion(version: string): number {
  const parts = version.split('.').map(Number);
  return parts[0] * 10000 + parts[1] * 100 + parts[2];
}

/**
 * Compare two version strings
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const n1 = parseVersion(v1);
  const n2 = parseVersion(v2);

  if (n1 < n2) return -1;
  if (n1 > n2) return 1;
  return 0;
}

/**
 * Get all versions in chronological order
 */
function getOrderedVersions(): string[] {
  return Object.keys(migrations).sort((a, b) => compareVersions(a, b));
}

/**
 * Migrate settings from one version to another
 */
export function migrateSettings(
  settings: UnvalidatedSettings | AppSettings,
  fromVersion: string,
  toVersion: string = SETTINGS_VERSION
): UnvalidatedSettings | AppSettings {
  // No migration needed if versions match
  if (fromVersion === toVersion) {
    logger.log(`Settings already at version ${toVersion}`);
    return settings;
  }

  const orderedVersions = getOrderedVersions();
  const startIdx = orderedVersions.indexOf(fromVersion);
  const endIdx = orderedVersions.indexOf(toVersion);

  // Validate versions
  if (startIdx === -1) {
    logger.error(`Unknown source version: ${fromVersion}`);
    throw new Error(`Cannot migrate from unknown version: ${fromVersion}`);
  }

  if (endIdx === -1) {
    logger.error(`Unknown target version: ${toVersion}`);
    throw new Error(`Cannot migrate to unknown version: ${toVersion}`);
  }

  // Check if migration is backwards (downgrade)
  if (startIdx > endIdx) {
    logger.warn(`Attempting to downgrade from ${fromVersion} to ${toVersion}`);
    // Allow downgrade but warn - just return settings as-is
    return settings;
  }

  // Apply migrations sequentially
  let migrated = { ...settings };

  logger.log(`Migrating settings from ${fromVersion} to ${toVersion}`);

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const version = orderedVersions[i];
    const migrationFn = migrations[version];

    if (!migrationFn) {
      logger.warn(`No migration function for version ${version}`);
      continue;
    }

    try {
      logger.log(`  Applying migration for ${version}...`);
      migrated = migrationFn(migrated);
    } catch (error) {
      logger.error(`Migration failed at version ${version}:`, error);
      throw new Error(`Settings migration failed at version ${version}`);
    }
  }

  logger.log(`Settings migration complete: ${fromVersion} → ${toVersion}`);
  return migrated;
}

/**
 * Check if settings need migration
 */
export function needsMigration(currentVersion: string): boolean {
  return compareVersions(currentVersion, SETTINGS_VERSION) < 0;
}

/**
 * Validate settings structure
 * Ensures all required fields exist
 */
export function validateSettings(settings: unknown): settings is AppSettings {
  // Basic structure validation
  if (!settings || typeof settings !== 'object') {
    return false;
  }

  // Check for required fields (sample - adjust as needed)
  const requiredFields: (keyof AppSettings)[] = [
    'theme',
    'accentColor',
  ];

  for (const field of requiredFields) {
    if (!(field in settings)) {
      logger.warn(`Settings validation failed: missing field '${field}'`);
      return false;
    }
  }

  return true;
}

/**
 * Attempt to repair invalid settings
 * Merges with defaults if validation fails
 */
export function repairSettings(
  settings: UnvalidatedSettings | AppSettings,
  defaults: AppSettings
): AppSettings {
  if (validateSettings(settings)) {
    return settings;
  }

  logger.warn('Settings validation failed, merging with defaults');

  // Merge with defaults, preserving valid values
  return {
    ...defaults,
    ...settings,
  };
}

/**
 * Create a rollback point for settings
 * Returns a function that can restore the settings
 */
export function createRollback(settings: AppSettings): () => AppSettings {
  const snapshot = JSON.parse(JSON.stringify(settings));

  return () => {
    logger.log('Rolling back settings to previous state');
    return snapshot;
  };
}

/**
 * Export settings with metadata for migration tracking
 */
export interface SettingsExport {
  version: string;
  exportedAt: string;
  settings: AppSettings;
  metadata?: {
    appVersion?: string;
    platform?: string;
    deviceType?: string;
  };
}

/**
 * Create a settings export with full metadata
 */
export function createSettingsExport(settings: AppSettings): SettingsExport {
  return {
    version: SETTINGS_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    metadata: {
      platform: navigator.platform,
      deviceType: /mobile/i.test(navigator.userAgent) ? 'mobile' : 'desktop',
    },
  };
}

/**
 * Import settings with automatic migration
 */
export function importSettingsWithMigration(
  exportData: SettingsExport | AppSettings,
  defaults: AppSettings
): { success: boolean; settings: AppSettings; migrated: boolean } {
  try {
    // Handle legacy format (plain settings object)
    if (!('version' in exportData) || !('settings' in exportData)) {
      logger.warn('Importing legacy settings format');
      const repaired = repairSettings(exportData, defaults);
      return { success: true, settings: repaired, migrated: false };
    }

    const { version: sourceVersion, settings: importedSettings } = exportData as SettingsExport;

    // Check if migration is needed
    if (needsMigration(sourceVersion)) {
      logger.log(`Settings require migration from ${sourceVersion}`);
      const migrated = migrateSettings(importedSettings, sourceVersion);
      const repaired = repairSettings(migrated, defaults);
      return { success: true, settings: repaired, migrated: true };
    }

    // No migration needed, just validate
    const repaired = repairSettings(importedSettings, defaults);
    return { success: true, settings: repaired, migrated: false };
  } catch (error) {
    logger.error('Failed to import settings:', error);
    return { success: false, settings: defaults, migrated: false };
  }
}
