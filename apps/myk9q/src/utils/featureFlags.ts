/**
 * Feature Flags System
 *
 * Central system for managing feature rollouts and experimental features.
 * Integrates with user settings for beta features opt-in.
 */

import { logger } from './logger';

/**
 * Available feature flags
 */
export type FeatureFlag =
  // Phase 2+ Features (not yet implemented)
  | 'offline-indicators'
  | 'conflict-resolution'
  | 'settings-sync'
  | 'network-aware-sync'

  // Phase 3+ Features
  | 'performance-budget'
  | 'image-optimization'
  | 'animation-controls'

  // Phase 4+ Features
  | 'progressive-disclosure'
  | 'settings-search'

  // Phase 5+ Features
  | 'pull-to-refresh'
  | 'advanced-haptics'

  // Phase 6+ Features
  | 'notification-scheduling'
  | 'do-not-disturb'

  // Phase 7+ Features
  | 'voice-announcements'
  | 'auto-save-drafts'

  // Phase 8+ Features
  | 'session-management'
  | 'biometric-auth'

  // Phase 9+ Features
  | 'fps-counter'
  | 'network-monitor'
  | 'settings-analytics'

  // Experimental Features
  | 'new-ui-components'
  | 'advanced-scoresheet-layouts'
  | 'ml-powered-defaults';

/**
 * Feature flag configuration
 */
interface FeatureFlagConfig {
  enabled: boolean; // Is the feature enabled globally?
  requiresBeta: boolean; // Does user need beta features enabled?
  developmentOnly: boolean; // Only available in development mode?
  description: string;
}

/**
 * Feature flag definitions
 */
const featureFlags: Record<FeatureFlag, FeatureFlagConfig> = {
  // Phase 2+
  'offline-indicators': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Show offline status indicators and queue size',
  },
  'conflict-resolution': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'UI for resolving sync conflicts',
  },
  'settings-sync': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Sync settings across devices',
  },
  'network-aware-sync': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Adjust sync behavior based on network type',
  },

  // Phase 3+
  'performance-budget': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: true,
    description: 'Performance monitoring and budget alerts',
  },
  'image-optimization': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Optimized image loading with srcset',
  },
  'animation-controls': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Fine-grained animation controls',
  },

  // Phase 4+
  'progressive-disclosure': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Organized settings with Basic/Advanced sections',
  },
  'settings-search': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Search and filter settings',
  },

  // Phase 5+
  'pull-to-refresh': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Pull down to refresh functionality',
  },
  'advanced-haptics': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Advanced haptic feedback patterns',
  },

  // Phase 6+
  'notification-scheduling': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Scheduled notifications for events',
  },
  'do-not-disturb': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Do Not Disturb mode with quiet hours',
  },

  // Phase 7+
  'voice-announcements': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Text-to-speech announcements during scoring',
  },
  'auto-save-drafts': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Auto-save scoring drafts with recovery',
  },

  // Phase 8+
  'session-management': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: false,
    description: 'Auto-logout and session timeout',
  },
  'biometric-auth': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Fingerprint/Face ID authentication',
  },

  // Phase 9+
  'fps-counter': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: true,
    description: 'Display FPS counter for performance monitoring',
  },
  'network-monitor': {
    enabled: false,
    requiresBeta: false,
    developmentOnly: true,
    description: 'Network request inspector',
  },
  'settings-analytics': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: true,
    description: 'Track settings usage patterns',
  },

  // Experimental
  'new-ui-components': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: true,
    description: 'Experimental UI component designs',
  },
  'advanced-scoresheet-layouts': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: false,
    description: 'Alternative scoresheet layouts',
  },
  'ml-powered-defaults': {
    enabled: false,
    requiresBeta: true,
    developmentOnly: true,
    description: 'ML-powered smart default settings',
  },
};

/**
 * Get settings from localStorage (avoids circular dependency)
 */
function getSettings() {
  try {
    const stored = localStorage.getItem('myK9Q_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed?.state?.settings;
    }
  } catch (error) {
    logger.error('Failed to get settings for feature flags:', error);
  }
  return null;
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const config = featureFlags[flag];

  if (!config) {
    logger.warn(`Unknown feature flag: ${flag}`);
    return false;
  }

  // Check if globally enabled
  if (!config.enabled) {
    return false;
  }

  // Check if development-only in production
  if (config.developmentOnly && !import.meta.env.DEV) {
    return false;
  }

  // Check if requires beta features
  if (config.requiresBeta) {
    const settings = getSettings();
    if (!settings?.enableBetaFeatures) {
      return false;
    }
  }

  return true;
}

/**
 * Get all enabled feature flags
 */
export function getEnabledFeatures(): FeatureFlag[] {
  return (Object.keys(featureFlags) as FeatureFlag[]).filter(isFeatureEnabled);
}

/**
 * Get feature flag configuration
 */
export function getFeatureConfig(flag: FeatureFlag): FeatureFlagConfig | null {
  return featureFlags[flag] || null;
}

/**
 * Override a feature flag (for testing/debugging)
 * Only works in development mode
 */
export function overrideFeatureFlag(flag: FeatureFlag, enabled: boolean): void {
  if (!import.meta.env.DEV) {
    logger.warn('Feature flag overrides only work in development mode');
    return;
  }

  if (featureFlags[flag]) {
    featureFlags[flag].enabled = enabled;
    logger.log(`Feature flag '${flag}' override: ${enabled}`);
  }
}

/**
 * List all feature flags with their status
 */
export function listFeatureFlags(): Array<{
  flag: FeatureFlag;
  enabled: boolean;
  config: FeatureFlagConfig;
}> {
  return (Object.keys(featureFlags) as FeatureFlag[]).map((flag) => ({
    flag,
    enabled: isFeatureEnabled(flag),
    config: featureFlags[flag],
  }));
}
