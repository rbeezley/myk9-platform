/**
 * User Preferences Service
 * Persists user preferences to the Supabase `user_preferences` table.
 * Preferences are stored as a single JSONB blob in the `preferences` column.
 */

import type { UserPreferences, PreferencesUpdate, DeviceOverrides } from '@/types/user-preferences';
import {
  DEFAULT_THEME_PREFERENCES,
  DEFAULT_COMPETITION_PREFERENCES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  DEFAULT_DATA_PREFERENCES,
  DEFAULT_PRIVACY_PREFERENCES,
} from '@/types/user-preferences';
import { logger } from '@/services/LoggingService';
import { supabase } from '@/lib/supabase';

const APP_ID = 'myk9show';

/**
 * Build a full UserPreferences object from defaults for the given userId.
 */
function buildDefaults(userId: string): UserPreferences {
  const now = new Date();
  return {
    userId,
    theme: { ...DEFAULT_THEME_PREFERENCES },
    competition: { ...DEFAULT_COMPETITION_PREFERENCES },
    notifications: { ...DEFAULT_NOTIFICATION_PREFERENCES },
    data: { ...DEFAULT_DATA_PREFERENCES },
    privacy: { ...DEFAULT_PRIVACY_PREFERENCES },
    deviceOverrides: {},
    version: 1,
    lastSyncedAt: now,
    lastModifiedAt: now,
    lastModifiedBy: '',
    syncConflicts: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Shape stored in the JSONB `preferences` column.
 * Contains all preference categories and sync metadata (but not userId or DB timestamps).
 */
interface StoredPreferences {
  theme?: Partial<UserPreferences['theme']>;
  competition?: Partial<UserPreferences['competition']>;
  notifications?: Partial<UserPreferences['notifications']>;
  data?: Partial<UserPreferences['data']>;
  privacy?: Partial<UserPreferences['privacy']>;
  deviceOverrides?: Record<string, DeviceOverrides>;
  version?: number;
  lastModifiedBy?: string;
  syncConflicts?: string[];
}

/**
 * Deep-merge stored preferences from the DB into defaults.
 */
function mergeWithDefaults(
  userId: string,
  stored: StoredPreferences,
  dbRow: { created_at?: string | null; updated_at?: string | null }
): UserPreferences {
  const defaults = buildDefaults(userId);
  return {
    ...defaults,
    theme: stored.theme ? { ...defaults.theme, ...stored.theme } : defaults.theme,
    competition: stored.competition
      ? {
          ...defaults.competition,
          ...stored.competition,
          defaultFilters: {
            ...defaults.competition.defaultFilters,
            ...(stored.competition.defaultFilters ?? {}),
          },
        }
      : defaults.competition,
    notifications: stored.notifications
      ? {
          ...defaults.notifications,
          ...stored.notifications,
          types: { ...defaults.notifications.types, ...(stored.notifications.types ?? {}) },
          timing: {
            ...defaults.notifications.timing,
            ...(stored.notifications.timing ?? {}),
            quietHours: {
              ...defaults.notifications.timing.quietHours,
              ...(stored.notifications.timing?.quietHours ?? {}),
            },
          },
          delivery: {
            ...defaults.notifications.delivery,
            ...(stored.notifications.delivery ?? {}),
          },
          sound: { ...defaults.notifications.sound, ...(stored.notifications.sound ?? {}) },
        }
      : defaults.notifications,
    data: stored.data ? { ...defaults.data, ...stored.data } : defaults.data,
    privacy: stored.privacy ? { ...defaults.privacy, ...stored.privacy } : defaults.privacy,
    deviceOverrides: stored.deviceOverrides ?? defaults.deviceOverrides,
    version: stored.version ?? defaults.version,
    lastModifiedBy: stored.lastModifiedBy ?? defaults.lastModifiedBy,
    syncConflicts:
      stored.syncConflicts != null ? stored.syncConflicts : (defaults.syncConflicts ?? []),
    lastSyncedAt: new Date(),
    lastModifiedAt: dbRow.updated_at ? new Date(dbRow.updated_at) : defaults.lastModifiedAt,
    createdAt: dbRow.created_at ? new Date(dbRow.created_at) : defaults.createdAt,
    updatedAt: dbRow.updated_at ? new Date(dbRow.updated_at) : defaults.updatedAt,
  };
}

/**
 * Extract the JSONB blob from a UserPreferences object for storage.
 */
function toStoredPreferences(prefs: UserPreferences): StoredPreferences {
  const stored: StoredPreferences = {
    theme: prefs.theme,
    competition: prefs.competition,
    notifications: prefs.notifications,
    data: prefs.data,
    privacy: prefs.privacy,
    deviceOverrides: prefs.deviceOverrides,
    version: prefs.version,
    lastModifiedBy: prefs.lastModifiedBy,
  };
  if (prefs.syncConflicts != null) {
    stored.syncConflicts = prefs.syncConflicts;
  }
  return stored;
}

export class UserPreferencesService {
  private static instance: UserPreferencesService;

  private constructor() {}

  static getInstance(): UserPreferencesService {
    if (!UserPreferencesService.instance) {
      UserPreferencesService.instance = new UserPreferencesService();
    }
    return UserPreferencesService.instance;
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    try {
      logger.debug('Loading user preferences from database', 'preferences', { userId });

      const { data, error } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('app', APP_ID)
        .maybeSingle();

      if (error) {
        logger.error(
          'Supabase query error loading preferences',
          'preferences',
          { userId, error: error.message },
          error as unknown as Error
        );
        throw error;
      }

      if (!data || data.preferences == null) {
        logger.debug('No preferences found in database, returning defaults', 'preferences', {
          userId,
        });
        return buildDefaults(userId);
      }

      // data.preferences is a Json blob — cast to our known shape
      const stored = data.preferences as unknown as StoredPreferences;
      return mergeWithDefaults(userId, stored, {
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
    } catch (error) {
      logger.error('Failed to load user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async updatePreferences(userId: string, updates: PreferencesUpdate): Promise<UserPreferences> {
    try {
      logger.debug('Updating user preferences', 'preferences', { userId, updates });

      // Load current from DB, merge updates
      const current = await this.loadPreferences(userId);

      const updated: UserPreferences = {
        ...current,
        theme: updates.theme ? { ...current.theme, ...updates.theme } : current.theme,
        competition: updates.competition
          ? { ...current.competition, ...updates.competition }
          : current.competition,
        notifications: updates.notifications
          ? { ...current.notifications, ...updates.notifications }
          : current.notifications,
        data: updates.data ? { ...current.data, ...updates.data } : current.data,
        privacy: updates.privacy ? { ...current.privacy, ...updates.privacy } : current.privacy,
        deviceOverrides: updates.deviceOverrides
          ? ({ ...current.deviceOverrides, ...updates.deviceOverrides } as Record<
              string,
              DeviceOverrides
            >)
          : current.deviceOverrides,
        updatedAt: new Date(),
      };

      await this.upsertPreferences(userId, updated);
      return updated;
    } catch (error) {
      logger.error('Failed to update user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async resetToDefaults(
    userId: string,
    category?: keyof PreferencesUpdate
  ): Promise<UserPreferences> {
    try {
      logger.debug('Resetting user preferences to defaults', 'preferences', { userId, category });

      if (category) {
        // Reset only the specified category
        const current = await this.loadPreferences(userId);
        const defaults = buildDefaults(userId);
        const updated: UserPreferences = {
          ...current,
          [category]: defaults[category],
          updatedAt: new Date(),
        };
        await this.upsertPreferences(userId, updated);
        return updated;
      }

      // Full reset
      const defaults = buildDefaults(userId);
      await this.upsertPreferences(userId, defaults);
      return defaults;
    } catch (error) {
      logger.error(
        'Failed to reset user preferences',
        'preferences',
        { userId, category },
        error as Error
      );
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Upsert the full preferences blob to the user_preferences table.
   * Uses the composite unique constraint on (user_id, app).
   */
  private async upsertPreferences(userId: string, prefs: UserPreferences): Promise<void> {
    const stored = toStoredPreferences(prefs);

    // Use JSON round-trip to produce a value compatible with Supabase's Json type.
    // The StoredPreferences object is fully JSON-serializable so this is safe.
    const jsonCompatible = JSON.parse(JSON.stringify(stored));

    // RLS policy requires auth_user_id = auth.uid(), so we must include it
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.id) {
      throw new Error('Cannot save preferences: no authenticated user');
    }

    const { error } = await supabase.from('user_preferences').upsert(
      {
        user_id: userId,
        auth_user_id: authUser.id,
        app: APP_ID,
        preferences: jsonCompatible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,app' }
    );

    if (error) {
      logger.error(
        'Supabase upsert error for preferences',
        'preferences',
        { userId, error: error.message },
        error as unknown as Error
      );
      throw error;
    }

    logger.debug('Preferences persisted to database', 'preferences', { userId });
  }
}

// Export singleton instance
export const userPreferencesService = UserPreferencesService.getInstance();
