/**
 * Settings Cloud Sync Service
 *
 * Syncs user settings to Supabase for cross-device persistence.
 * Handles conflict resolution when settings change on multiple devices.
 */

import { supabase } from '@/lib/supabase';
import { AppSettings, SETTINGS_VERSION } from '@/stores/settingsStore';
import { importSettingsWithMigration } from '@/utils/settingsMigration';
import { logger } from '@/utils/logger';

interface CloudPreference {
  id: string;
  user_id: string;
  device_id: string | null;
  settings: AppSettings;
  version: string;
  updated_at: string;
  created_at: string;
  last_synced_at: string | null;
}

interface SyncResult {
  success: boolean;
  synced: boolean;
  conflictDetected: boolean;
  error?: string;
}

/** Realtime payload data for user_preferences updates */
interface RealtimePreferencePayload {
  device_id: string | null;
  settings: AppSettings;
}

/**
 * Get user/device identifier for preferences
 * Uses device-specific ID for anonymous exhibitor access
 * (App uses passcode-based auth for staff roles, not user accounts)
 */
function getUserDeviceId(): { userId: string; deviceId: string | null } {
  let deviceId = localStorage.getItem('myK9Q_device_id');

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('myK9Q_device_id', deviceId);
  }

  // Exhibitors access anonymously - use device ID for settings sync
  const userId = 'anonymous';

  return { userId, deviceId };
}

/**
 * Upload settings to cloud
 */
export async function uploadSettings(settings: AppSettings): Promise<SyncResult> {
  try {
    const { userId, deviceId } = getUserDeviceId();

    // Check if preferences already exist
    const { data: existing, error: fetchError } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned
      logger.error('Failed to fetch existing preferences:', fetchError);
      return { success: false, synced: false, conflictDetected: false, error: fetchError.message };
    }

    const now = new Date().toISOString();

    if (existing) {
      // Update existing preferences
      const { error: updateError } = await supabase
        .from('user_preferences')
        .update({
          settings,
          version: SETTINGS_VERSION,
          updated_at: now,
          last_synced_at: now,
        })
        .eq('id', existing.id);

      if (updateError) {
        logger.error('Failed to update preferences:', updateError);
        return { success: false, synced: false, conflictDetected: false, error: updateError.message };
      }
    } else {
      // Insert new preferences
      const { error: insertError } = await supabase
        .from('user_preferences')
        .insert({
          user_id: userId,
          device_id: deviceId,
          settings,
          version: SETTINGS_VERSION,
          updated_at: now,
          created_at: now,
          last_synced_at: now,
        });

      if (insertError) {
        logger.error('Failed to insert preferences:', insertError);
        return { success: false, synced: false, conflictDetected: false, error: insertError.message };
      }
    }

return { success: true, synced: true, conflictDetected: false };
  } catch (error) {
    logger.error('Settings upload error:', error);
    return {
      success: false,
      synced: false,
      conflictDetected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Download settings from cloud
 */
export async function downloadSettings(
  localSettings: AppSettings,
  localUpdatedAt: Date
): Promise<{ settings: AppSettings | null; result: SyncResult }> {
  try {
    const { userId, deviceId } = getUserDeviceId();

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .eq('device_id', deviceId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No cloud settings found
        return {
          settings: null,
          result: { success: true, synced: false, conflictDetected: false },
        };
      }

      logger.error('Failed to download settings:', error);
      return {
        settings: null,
        result: { success: false, synced: false, conflictDetected: false, error: error.message },
      };
    }

    const cloudPreference = data as unknown as CloudPreference;
    const cloudUpdatedAt = new Date(cloudPreference.updated_at);

    // Detect conflict: both local and cloud have changes
    const timeDiff = Math.abs(cloudUpdatedAt.getTime() - localUpdatedAt.getTime());
    const conflictDetected = timeDiff > 5000; // 5 second threshold

    if (conflictDetected) {
      logger.warn('⚠️ Settings conflict detected:', {
        local: localUpdatedAt,
        cloud: cloudUpdatedAt,
      });

      // For now, use last-write-wins (cloud wins)
      // In the future, this could prompt the user
      const merged = await mergeSettings(localSettings, cloudPreference.settings);
      return {
        settings: merged,
        result: { success: true, synced: true, conflictDetected: true },
      };
    }

    // No conflict, use cloud settings if newer
    if (cloudUpdatedAt > localUpdatedAt) {
      // Migrate settings if version mismatch
      const migrationResult = importSettingsWithMigration(
        {
          version: cloudPreference.version,
          exportedAt: cloudPreference.updated_at,
          settings: cloudPreference.settings,
        },
        localSettings
      );

      if (!migrationResult.success) {
        return {
          settings: null,
          result: { success: false, synced: false, conflictDetected: false, error: 'Migration failed' },
        };
      }

return {
        settings: migrationResult.settings,
        result: { success: true, synced: true, conflictDetected: false },
      };
    }

    // Local is newer, no download needed
    return {
      settings: null,
      result: { success: true, synced: false, conflictDetected: false },
    };
  } catch (error) {
    logger.error('Settings download error:', error);
    return {
      settings: null,
      result: {
        success: false,
        synced: false,
        conflictDetected: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Merge conflicting settings
 * Strategy: Prefer cloud settings for most fields, but preserve local device-specific settings
 */
async function mergeSettings(
  localSettings: AppSettings,
  cloudSettings: AppSettings
): Promise<AppSettings> {
  // Device-specific settings that should prefer local
  const deviceSpecificKeys: (keyof AppSettings)[] = [
    'hapticFeedback',
    'enableAnimations',
    'enableBlur',
    'enableShadows',
  ];

  // Start with cloud settings
  const merged = { ...cloudSettings };

  // Preserve device-specific settings from local
  // Use type assertion with Record to allow dynamic key assignment
  deviceSpecificKeys.forEach((key) => {
    if (localSettings[key] !== undefined) {
      (merged as Record<keyof AppSettings, unknown>)[key] = localSettings[key];
    }
  });

return merged;
}

/**
 * Sync settings bidirectionally
 * Uploads local changes and downloads remote changes
 */
export async function syncSettings(
  localSettings: AppSettings,
  localUpdatedAt: Date
): Promise<{ settings: AppSettings | null; result: SyncResult }> {
  // First, try to download remote changes
  const downloadResult = await downloadSettings(localSettings, localUpdatedAt);

  if (!downloadResult.result.success) {
    return downloadResult;
  }

  // If remote is newer, use it
  if (downloadResult.settings) {
    return downloadResult;
  }

  // If local is newer or equal, upload it
  const uploadResult = await uploadSettings(localSettings);

  return {
    settings: null,
    result: uploadResult,
  };
}

/**
 * Subscribe to real-time settings changes from other devices
 */
export function subscribeToSettingsUpdates(
  userId: string,
  deviceId: string,
  onUpdate: (settings: AppSettings) => void
): () => void {
  const channel = supabase
    .channel(`user_preferences:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_preferences',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Only notify if update is from a different device
        const data = payload.new as RealtimePreferencePayload;
        if (data.device_id !== deviceId) {
          onUpdate(data.settings);
        }
      }
    )
    .subscribe();

  return () => {
    channel.unsubscribe();
  };
}

/**
 * Delete cloud settings for current user/device
 */
export async function deleteCloudSettings(): Promise<boolean> {
  try {
    const { userId, deviceId } = getUserDeviceId();

    const { error } = await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('device_id', deviceId);

    if (error) {
      logger.error('Failed to delete cloud settings:', error);
      return false;
    }

return true;
  } catch (error) {
    logger.error('Delete settings error:', error);
    return false;
  }
}
