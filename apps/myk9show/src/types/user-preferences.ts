/**
 * User Preferences Types
 * Phase 6.4: User Preferences & UI State
 *
 * Type definitions for user preferences system with cross-device synchronization
 */

// Matches actual user_preferences table in Supabase
export type UserPreferencesRow = {
  id: string;
  app: string;
  user_id: string | null;
  auth_user_id: string | null;
  license_key: string | null;
  preferences: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type UserPreferencesInsert = Omit<UserPreferencesRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UserPreferencesUpdate = Partial<UserPreferencesInsert>;

// Theme preferences
export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'blue' | 'purple' | 'green' | 'terracotta';
export type LayoutDensity = 'compact' | 'comfortable' | 'spacious';
export type FontSizeScale = 'small' | 'medium' | 'large' | 'extra-large';

export interface ThemePreferences {
  mode: ThemeMode;
  colorScheme: ColorScheme;
  layoutDensity: LayoutDensity;
  fontSize: FontSizeScale;
  reduceMotion: boolean;
  highContrast: boolean;
}

// Competition preferences
export type DefaultView = 'list' | 'grid' | 'calendar' | 'timeline';
export type SortOption = 'date_asc' | 'date_desc' | 'name_asc' | 'name_desc' | 'status';
export type RefreshInterval = 30 | 60 | 120 | 300 | 0; // seconds, 0 = manual

export interface CompetitionPreferences {
  defaultView: DefaultView;
  defaultSort: SortOption;
  showPastEvents: boolean;
  autoRefreshInterval: RefreshInterval;
  enableLiveUpdates: boolean;
  showNotifications: boolean;
  defaultFilters: {
    organizations: string[];
    disciplines: string[];
    locations: string[];
  };
}

// Notification preferences
export interface QuietHours {
  enabled: boolean;
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  timezone: string;
  weekendsOnly: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  types: {
    showReminders: boolean;
    entryDeadlines: boolean;
    resultUpdates: boolean;
    scheduleChanges: boolean;
    judgeAssignments: boolean;
    emergencyAlerts: boolean;
    paymentReminders: boolean;
    entryConfirmations: boolean;
  };
  timing: {
    showReminderHours: number[];
    entryDeadlineHours: number[];
    quietHours: QuietHours;
  };
  delivery: {
    browser: boolean;
    email: boolean;
    sms: boolean;
  };
  sound: {
    enabled: boolean;
    volume: number; // 0-1
    useCustomSound: boolean;
  };
}

// Data & Performance preferences
export type SyncMode = 'auto' | 'manual' | 'offline-first';
export type CacheStrategy = 'aggressive' | 'balanced' | 'minimal';
export type BandwidthMode = 'high' | 'medium' | 'low' | 'data-saver';

export interface DataPreferences {
  syncMode: SyncMode;
  cacheStrategy: CacheStrategy;
  bandwidthMode: BandwidthMode;
  preloadImages: boolean;
  enableOfflineMode: boolean;
  maxCacheSize: number; // MB
  backgroundSync: boolean;
}

// Privacy preferences
export interface PrivacyPreferences {
  sharePresence: boolean;
  showOnlineStatus: boolean;
  allowAnalytics: boolean;
  dataCollection: boolean;
  shareUsageStats: boolean;
  enableCrashReporting: boolean;
}

// Device-specific overrides
export interface DeviceOverrides {
  theme: Partial<ThemePreferences>;
  notifications: Partial<NotificationPreferences>;
  data: Partial<DataPreferences>;
}

// Complete user preferences structure
export interface UserPreferences {
  id?: string;
  userId: string;

  // Preference categories
  theme: ThemePreferences;
  competition: CompetitionPreferences;
  notifications: NotificationPreferences;
  data: DataPreferences;
  privacy: PrivacyPreferences;

  // Device-specific settings
  deviceOverrides: Record<string, DeviceOverrides>;

  // Sync metadata
  version: number;
  lastSyncedAt: Date;
  lastModifiedAt: Date;
  lastModifiedBy: string; // device ID
  syncConflicts?: string[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// Preferences update payload
export interface PreferencesUpdate {
  theme?: Partial<ThemePreferences>;
  competition?: Partial<CompetitionPreferences>;
  notifications?: Partial<NotificationPreferences>;
  data?: Partial<DataPreferences>;
  privacy?: Partial<PrivacyPreferences>;
  deviceOverrides?: Record<string, Partial<DeviceOverrides>>;
}

// Sync status
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'conflict';

export interface SyncState {
  status: SyncStatus;
  lastSyncAt: Date | null;
  pendingChanges: boolean;
  conflictCount: number;
  errorMessage?: string;
}

// Device information
export interface DeviceInfo {
  id: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet';
  platform: string;
  userAgent: string;
  lastSeen: Date;
  isCurrentDevice: boolean;
}

// Export for hooks and services
export interface UseUserPreferencesReturn {
  // Current preferences
  preferences: UserPreferences | null;
  loading: boolean;
  error: string | null;

  // Sync state
  syncState: SyncState;
  devices: DeviceInfo[];

  // Actions
  updatePreferences: (updates: PreferencesUpdate) => Promise<void>;
  resetToDefaults: (category?: keyof PreferencesUpdate) => Promise<void>;
  exportPreferences: () => Promise<string>;
  importPreferences: (data: string) => Promise<void>;
  resolveConflicts: (resolution: 'local' | 'remote' | 'merge') => Promise<void>;
  forceSync: () => Promise<void>;

  // Device management
  registerDevice: (
    deviceInfo: Omit<DeviceInfo, 'id' | 'lastSeen' | 'isCurrentDevice'>
  ) => Promise<void>;
  removeDevice: (deviceId: string) => Promise<void>;
}

// Default preferences
export const DEFAULT_THEME_PREFERENCES: ThemePreferences = {
  mode: 'system',
  colorScheme: 'blue',
  layoutDensity: 'comfortable',
  fontSize: 'medium',
  reduceMotion: false,
  highContrast: false,
};

export const DEFAULT_COMPETITION_PREFERENCES: CompetitionPreferences = {
  defaultView: 'list',
  defaultSort: 'date_asc',
  showPastEvents: false,
  autoRefreshInterval: 60,
  enableLiveUpdates: true,
  showNotifications: true,
  defaultFilters: {
    organizations: [],
    disciplines: [],
    locations: [],
  },
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  types: {
    showReminders: true,
    entryDeadlines: true,
    resultUpdates: true,
    scheduleChanges: true,
    judgeAssignments: true,
    emergencyAlerts: true,
    paymentReminders: true,
    entryConfirmations: true,
  },
  timing: {
    showReminderHours: [24, 48],
    entryDeadlineHours: [24, 48],
    quietHours: {
      enabled: false,
      startTime: '22:00',
      endTime: '08:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekendsOnly: false,
    },
  },
  delivery: {
    browser: true,
    email: false,
    sms: false,
  },
  sound: {
    enabled: true,
    volume: 0.7,
    useCustomSound: false,
  },
};

export const DEFAULT_DATA_PREFERENCES: DataPreferences = {
  syncMode: 'auto',
  cacheStrategy: 'balanced',
  bandwidthMode: 'high',
  preloadImages: true,
  enableOfflineMode: true,
  maxCacheSize: 100,
  backgroundSync: true,
};

export const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  sharePresence: true,
  showOnlineStatus: true,
  allowAnalytics: true,
  dataCollection: true,
  shareUsageStats: true,
  enableCrashReporting: true,
};

export const DEFAULT_USER_PREFERENCES: Omit<
  UserPreferences,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
> = {
  theme: DEFAULT_THEME_PREFERENCES,
  competition: DEFAULT_COMPETITION_PREFERENCES,
  notifications: DEFAULT_NOTIFICATION_PREFERENCES,
  data: DEFAULT_DATA_PREFERENCES,
  privacy: DEFAULT_PRIVACY_PREFERENCES,
  deviceOverrides: {},
  version: 1,
  lastSyncedAt: new Date(),
  lastModifiedAt: new Date(),
  lastModifiedBy: '',
  syncConflicts: [],
};
