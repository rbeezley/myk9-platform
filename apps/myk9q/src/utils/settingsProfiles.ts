/**
 * Settings Profiles System
 *
 * Pre-configured settings profiles optimized for different user roles.
 * Allows quick switching between Judge, Exhibitor, Spectator, and Admin modes.
 */

import { AppSettings } from '@/stores/settingsStore';
import { logger } from './logger';

export type ProfileType = 'judge' | 'exhibitor' | 'spectator' | 'admin' | 'custom';

export interface SettingsProfile {
  id: ProfileType;
  name: string;
  description: string;
  icon: string;
  settings: Partial<AppSettings>;
}

/**
 * Pre-defined settings profiles
 */
export const settingsProfiles: Record<ProfileType, SettingsProfile> = {
  judge: {
    id: 'judge',
    name: 'Judge Mode',
    description: 'Optimized for judges - performance focus, minimal distractions',
    icon: '⚖️',
    settings: {
      // Performance - prioritize speed
      enableAnimations: false,
      enableBlur: false,
      enableShadows: false,

      // Mobile - optimized for tablets
      hapticFeedback: true,
      pullToRefresh: true,

      // Notifications - essential only
      enableNotifications: true,
      voiceNotifications: false,
      notifyYourTurnLeadDogs: 3,

      // Voice - scoring announcements off by default
      voiceAnnouncements: false,

      // Security - balanced
      autoLogout: 480, // 8 hours
    },
  },

  exhibitor: {
    id: 'exhibitor',
    name: 'Exhibitor Mode',
    description: 'For exhibitors - notifications enabled, schedule focus, mobile optimized',
    icon: '🐕',
    settings: {
      // Performance - balanced
      enableAnimations: null, // auto-detect
      enableBlur: null,
      enableShadows: null,

      // Mobile - optimized
      hapticFeedback: true,
      pullToRefresh: true,

      // Notifications - all enabled
      enableNotifications: true,
      voiceNotifications: false,
      notifyYourTurnLeadDogs: 3,

      // Voice - exhibitors don't have scoring
      voiceAnnouncements: false,

      // Security - standard
      autoLogout: 480, // 8 hours
    },
  },

  spectator: {
    id: 'spectator',
    name: 'Spectator Mode',
    description: 'Read-only view - results focus, minimal notifications',
    icon: '👀',
    settings: {
      // Performance - balance quality and speed
      enableAnimations: null,
      enableBlur: null,
      enableShadows: null,

      // Mobile - standard
      hapticFeedback: false,
      pullToRefresh: true,

      // Notifications - results only
      enableNotifications: true,
      voiceNotifications: false,
      notifyYourTurnLeadDogs: 3,

      // Voice - spectators don't have scoring
      voiceAnnouncements: false,

      // Security - standard
      autoLogout: 480, // 8 hours
    },
  },

  admin: {
    id: 'admin',
    name: 'Admin Mode',
    description: 'Full control - all features enabled, developer tools available',
    icon: '⚙️',
    settings: {
      // Performance - all features on
      enableAnimations: true,
      enableBlur: true,
      enableShadows: true,

      // Mobile - full features
      hapticFeedback: true,
      pullToRefresh: true,

      // Notifications - all types
      enableNotifications: true,
      voiceNotifications: false,
      notifyYourTurnLeadDogs: 3,

      // Voice - scoring announcements (admins can enable)
      voiceAnnouncements: false,

      // Security - standard
      autoLogout: 480, // 8 hours

      // Advanced - enabled
      developerMode: true,
      consoleLogging: 'all',
      enableBetaFeatures: true,
      enablePerformanceMonitoring: true,
    },
  },

  custom: {
    id: 'custom',
    name: 'Custom Profile',
    description: 'Your personalized settings',
    icon: '✨',
    settings: {}, // Empty - will be filled with current settings
  },
};

/**
 * Apply a settings profile
 * Merges profile settings with current settings
 */
export function applyProfile(
  profile: ProfileType,
  currentSettings: AppSettings
): AppSettings {
  const profileConfig = settingsProfiles[profile];

  if (!profileConfig) {
    logger.error(`Unknown profile: ${profile}`);
    return currentSettings;
  }

  logger.log(`Applying settings profile: ${profileConfig.name}`);

  // Merge profile settings with current settings
  // Profile settings take precedence
  return {
    ...currentSettings,
    ...profileConfig.settings,
  };
}

/**
 * Get profile by ID
 */
export function getProfile(profileId: ProfileType): SettingsProfile | null {
  return settingsProfiles[profileId] || null;
}

/**
 * Get all available profiles
 */
export function getAllProfiles(): SettingsProfile[] {
  return Object.values(settingsProfiles);
}

/**
 * Detect which profile best matches current settings
 */
export function detectCurrentProfile(settings: AppSettings): ProfileType {
  let bestMatch: ProfileType = 'custom';
  let highestScore = 0;

  // Check each profile
  for (const [profileId, profile] of Object.entries(settingsProfiles)) {
    if (profileId === 'custom') continue;

    let matchCount = 0;
    let totalChecks = 0;

    // Count matching settings
    for (const [key, value] of Object.entries(profile.settings)) {
      totalChecks++;
      if (settings[key as keyof AppSettings] === value) {
        matchCount++;
      }
    }

    const score = totalChecks > 0 ? matchCount / totalChecks : 0;

    if (score > highestScore && score > 0.7) {
      // 70% match threshold
      highestScore = score;
      bestMatch = profileId as ProfileType;
    }
  }

  return bestMatch;
}

/**
 * Create a custom profile from current settings
 */
export function createCustomProfile(
  name: string,
  description: string,
  settings: AppSettings
): SettingsProfile {
  return {
    id: 'custom',
    name,
    description,
    icon: '✨',
    settings,
  };
}

/**
 * Save custom profile to localStorage
 */
export function saveCustomProfile(profile: SettingsProfile): void {
  try {
    const key = `myK9Q_custom_profile_${profile.id}`;
    localStorage.setItem(key, JSON.stringify(profile));
    logger.log(`Saved custom profile: ${profile.name}`);
  } catch (error) {
    logger.error('Failed to save custom profile:', error);
  }
}

/**
 * Load custom profiles from localStorage
 */
export function loadCustomProfiles(): SettingsProfile[] {
  const profiles: SettingsProfile[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('myK9Q_custom_profile_')) {
        const data = localStorage.getItem(key);
        if (data) {
          const profile = JSON.parse(data);
          profiles.push(profile);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to load custom profiles:', error);
  }

  return profiles;
}

/**
 * Delete a custom profile
 */
export function deleteCustomProfile(profileId: string): void {
  try {
    const key = `myK9Q_custom_profile_${profileId}`;
    localStorage.removeItem(key);
    logger.log(`Deleted custom profile: ${profileId}`);
  } catch (error) {
    logger.error('Failed to delete custom profile:', error);
  }
}
