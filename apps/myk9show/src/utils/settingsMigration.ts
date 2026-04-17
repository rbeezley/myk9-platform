/**
 * Settings Migration Utility
 *
 * Handles importing settings with version migration support.
 */

import type { AppSettings } from '@/stores/settingsStore';

export interface MigrationResult {
  success: boolean;
  settings: AppSettings;
  migratedFrom?: string | undefined;
}

interface ImportedSettings {
  version?: string;
  settings?: Partial<AppSettings>;
  [key: string]: unknown;
}

/**
 * Import settings with migration support.
 * Merges imported settings with defaults, handling missing or new fields.
 */
export function importSettingsWithMigration(
  imported: ImportedSettings,
  defaults: AppSettings
): MigrationResult {
  try {
    // Extract settings from import (handle both flat and nested formats)
    const importedSettings = imported.settings || imported;

    // Merge with defaults - imported values take precedence
    const mergedSettings: AppSettings = {
      ...defaults,
      ...(importedSettings as Partial<AppSettings>),
    };

    // Validate critical fields and reset to defaults if invalid
    if (!['light', 'dark', 'auto'].includes(mergedSettings.theme)) {
      mergedSettings.theme = defaults.theme;
    }

    // Migrate v1 accent names to v2
    const v1ToV2: Record<string, AppSettings['accentColor']> = {
      green: 'grove',
      blue: 'dusk',
      purple: 'heather',
      terracotta: 'clay',
    };
    if (v1ToV2[mergedSettings.accentColor]) {
      mergedSettings.accentColor = v1ToV2[mergedSettings.accentColor];
    }
    if (!['clay', 'grove', 'dusk', 'heather'].includes(mergedSettings.accentColor)) {
      mergedSettings.accentColor = defaults.accentColor;
    }

    return {
      success: true,
      settings: mergedSettings,
      migratedFrom: imported.version,
    };
  } catch {
    return {
      success: false,
      settings: defaults,
    };
  }
}
