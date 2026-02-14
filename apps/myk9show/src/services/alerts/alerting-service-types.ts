/**
 * Internal types and constants for the AlertingService.
 *
 * Keeps storage key definitions and service-internal type aliases
 * separate from the main class to improve readability.
 */

/** localStorage key constants used by AlertingService persistence methods. */
export const ALERTING_STORAGE_KEYS = {
  ALERTS: 'myK9Show_alerts',
  RULES: 'myK9Show_alert_rules',
  PREFERENCES: 'myK9Show_alert_preferences',
  NOTIFICATIONS: 'myK9Show_alert_notifications',
} as const;

/** Type derived from the storage keys object for type-safe access. */
export type AlertingStorageKeys = typeof ALERTING_STORAGE_KEYS;
