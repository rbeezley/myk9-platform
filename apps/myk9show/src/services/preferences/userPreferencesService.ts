/**
 * User Preferences Service - Mock Implementation
 * TODO: Implement proper database integration when user_preferences table is created
 */

import type {
  UserPreferences,
  PreferencesUpdate,
  DeviceInfo,
  SyncState,
  DeviceOverrides
} from '@/types/user-preferences';
import { logger } from '@/services/LoggingService';

// Simple DeviceInfo for backward compatibility
export interface SimpleDeviceInfo {
  deviceId: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  platform: string;
  userAgent: string;
  lastSeen: Date;
}

export class UserPreferencesService {
  private static instance: UserPreferencesService;
  private syncState: SyncState = {
    status: 'idle',
    lastSyncAt: null,
    pendingChanges: false,
    conflictCount: 0
  };

  private constructor() {}

  static getInstance(): UserPreferencesService {
    if (!UserPreferencesService.instance) {
      UserPreferencesService.instance = new UserPreferencesService();
    }
    return UserPreferencesService.instance;
  }

  async getUserPreferences(userId: string): Promise<UserPreferences> {
    try {
      logger.debug('Loading user preferences (mock)', 'preferences', { userId });

      // Return default preferences for now
      return await this.loadPreferences(userId);
    } catch (error) {
      logger.error('Failed to load user preferences', 'preferences', { userId }, error as Error);
      return await this.loadPreferences(userId);
    }
  }

  async updateUserPreferences(
    userId: string,
    updates: Partial<Omit<UserPreferences, 'userId' | 'createdAt' | 'updatedAt'>>
  ): Promise<boolean> {
    try {
      logger.debug('Updating user preferences (mock)', 'preferences', { userId, updates });
      return true;
    } catch (error) {
      logger.error('Failed to update user preferences', 'preferences', { userId }, error as Error);
      return false;
    }
  }

  async resetUserPreferences(userId: string): Promise<boolean> {
    try {
      logger.debug('Resetting user preferences (mock)', 'preferences', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to reset user preferences', 'preferences', { userId }, error as Error);
      return false;
    }
  }

  async logDeviceInfo(userId: string, deviceInfo: Partial<DeviceInfo>): Promise<boolean> {
    try {
      logger.debug('Logging device info (mock)', 'preferences', { userId, deviceInfo });
      return true;
    } catch (error) {
      logger.error('Failed to log device info', 'preferences', { userId }, error as Error);
      return false;
    }
  }

  async getUserDevices(userId: string): Promise<SimpleDeviceInfo[]> {
    try {
      logger.debug('Loading user devices (mock)', 'preferences', { userId });
      return [];
    } catch (error) {
      logger.error('Failed to load user devices', 'preferences', { userId }, error as Error);
      return [];
    }
  }

  // New methods required by useUserPreferences hook
  getSyncState(): SyncState {
    return { ...this.syncState };
  }

  async loadPreferences(userId: string): Promise<UserPreferences> {
    try {
      logger.debug('Loading user preferences (mock)', 'preferences', { userId });
      
      // Return default preferences structure
      return {
        userId,
        theme: {
          mode: 'system',
          colorScheme: 'blue',
          layoutDensity: 'comfortable',
          fontSize: 'medium',
          reduceMotion: false,
          highContrast: false
        },
        competition: {
          defaultView: 'list',
          defaultSort: 'date_asc',
          showPastEvents: false,
          autoRefreshInterval: 60,
          enableLiveUpdates: true,
          showNotifications: true,
          defaultFilters: {
            organizations: [],
            disciplines: [],
            locations: []
          }
        },
        notifications: {
          enabled: true,
          types: {
            showReminders: true,
            entryDeadlines: true,
            resultUpdates: true,
            scheduleChanges: true,
            judgeAssignments: false,
            emergencyAlerts: true,
            paymentReminders: true,
            entryConfirmations: true
          },
          timing: {
            showReminderHours: [24, 48],
            entryDeadlineHours: [24, 48],
            quietHours: {
              enabled: false,
              startTime: '22:00',
              endTime: '08:00',
              timezone: 'America/New_York',
              weekendsOnly: false
            }
          },
          delivery: {
            browser: true,
            email: true,
            sms: false
          },
          sound: {
            enabled: true,
            volume: 0.7,
            useCustomSound: false
          }
        },
        data: {
          syncMode: 'auto',
          cacheStrategy: 'balanced',
          bandwidthMode: 'high',
          preloadImages: true,
          enableOfflineMode: true,
          maxCacheSize: 100,
          backgroundSync: true
        },
        privacy: {
          sharePresence: true,
          showOnlineStatus: true,
          allowAnalytics: true,
          dataCollection: true,
          shareUsageStats: true,
          enableCrashReporting: true
        },
        deviceOverrides: {},
        version: 1,
        lastSyncedAt: new Date(),
        lastModifiedAt: new Date(),
        lastModifiedBy: 'mock-device',
        syncConflicts: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error) {
      logger.error('Failed to load user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async updatePreferences(userId: string, updates: PreferencesUpdate): Promise<UserPreferences> {
    try {
      logger.debug('Updating user preferences (mock)', 'preferences', { userId, updates });
      
      // Return updated preferences (merge with defaults)
      const current = await this.loadPreferences(userId);
      
      // Deep merge the updates into current preferences
      const updated: UserPreferences = {
        ...current,
        theme: updates.theme ? { ...current.theme, ...updates.theme } : current.theme,
        competition: updates.competition ? { ...current.competition, ...updates.competition } : current.competition,
        notifications: updates.notifications ? { ...current.notifications, ...updates.notifications } : current.notifications,
        data: updates.data ? { ...current.data, ...updates.data } : current.data,
        privacy: updates.privacy ? { ...current.privacy, ...updates.privacy } : current.privacy,
        deviceOverrides: updates.deviceOverrides ? { ...current.deviceOverrides, ...updates.deviceOverrides } as Record<string, DeviceOverrides> : current.deviceOverrides,
        updatedAt: new Date()
      };
      
      return updated;
    } catch (error) {
      logger.error('Failed to update user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async resetToDefaults(userId: string, category?: keyof PreferencesUpdate): Promise<UserPreferences> {
    try {
      logger.debug('Resetting user preferences to defaults (mock)', 'preferences', { userId, category });
      return await this.loadPreferences(userId);
    } catch (error) {
      logger.error('Failed to reset user preferences', 'preferences', { userId, category }, error as Error);
      throw error;
    }
  }

  async exportPreferences(userId: string): Promise<string> {
    try {
      logger.debug('Exporting user preferences (mock)', 'preferences', { userId });
      const preferences = await this.loadPreferences(userId);
      return JSON.stringify(preferences, null, 2);
    } catch (error) {
      logger.error('Failed to export user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async importPreferences(userId: string, data: string): Promise<UserPreferences> {
    try {
      logger.debug('Importing user preferences (mock)', 'preferences', { userId });
      const imported = JSON.parse(data) as UserPreferences;
      imported.userId = userId;
      imported.updatedAt = new Date();
      return imported;
    } catch (error) {
      logger.error('Failed to import user preferences', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async forceSync(userId: string): Promise<UserPreferences> {
    try {
      logger.debug('Force syncing user preferences (mock)', 'preferences', { userId });
      this.syncState.status = 'syncing';

      // Simulate sync delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      this.syncState.status = 'idle';
      this.syncState.lastSyncAt = new Date();
      this.syncState.pendingChanges = false;

      return await this.loadPreferences(userId);
    } catch (error) {
      logger.error('Failed to force sync user preferences', 'preferences', { userId }, error as Error);
      this.syncState.status = 'error';
      this.syncState.errorMessage = error instanceof Error ? error.message : 'Sync failed';
      throw error;
    }
  }

  async registerDevice(userId: string, deviceInfo?: Partial<DeviceInfo>): Promise<void> {
    try {
      logger.debug('Registering device (mock)', 'preferences', { userId, deviceInfo });
      // Mock device registration
    } catch (error) {
      logger.error('Failed to register device', 'preferences', { userId }, error as Error);
      throw error;
    }
  }

  async getDevices(userId: string): Promise<DeviceInfo[]> {
    try {
      logger.debug('Loading user devices (mock)', 'preferences', { userId });
      return [
        {
          id: 'device-1',
          name: 'Mock Device',
          type: 'desktop',
          platform: 'web',
          userAgent: navigator.userAgent,
          lastSeen: new Date(),
          isCurrentDevice: true
        }
      ];
    } catch (error) {
      logger.error('Failed to load user devices', 'preferences', { userId }, error as Error);
      return [];
    }
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    try {
      logger.debug('Removing device (mock)', 'preferences', { userId, deviceId });
      // Mock device removal
    } catch (error) {
      logger.error('Failed to remove device', 'preferences', { userId, deviceId }, error as Error);
      throw error;
    }
  }

  getDefaultPreferences(): UserPreferences {
    return this.loadPreferences('default') as unknown as UserPreferences;
  }
}

// Export singleton instance
export const userPreferencesService = UserPreferencesService.getInstance();