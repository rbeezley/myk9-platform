/**
 * @myk9/core
 *
 * Core utilities, types, and constants for the myK9 Platform.
 */

// Logger
export { logger, log, warn, error, debug, info } from './utils/logger';

// Network utilities
export {
  withTimeout,
  TimeoutError,
  calculateBackoffDelay,
  backoffDelay,
  isRetryableError,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_BACKOFF_BASE_MS,
  MAX_BACKOFF_MS,
  BACKOFF_JITTER,
  TIMEOUT_PRESETS,
} from './utils/network';

// Entity types
export type {
  BaseEntity,
  SyncableEntity,
  LicenseKeyScoped,
  ShowScoped,
  TrialScoped,
  ClassScoped,
  SoftDeletable,
  Auditable,
  EntityWithTraits,
} from './types/entities';

// Class status constants
export {
  CLASS_STATUS,
  LEGACY_STATUS_MAP,
  normalizeClassStatus,
  type ClassStatusValue,
} from './constants/class-status';

// Class display status helper
export {
  getClassDisplayStatus,
  type ClassDisplayStatus,
  type ClassDisplayStatusInput,
} from './helpers/class-display-status';

// Trial composite status (one composed line per trial)
export {
  deriveTrialCompositeStatus,
  deriveTrialStatusKey,
  type TrialCompositeKind,
  type TrialCompositeStatus,
  type TrialStatusKey,
  type TrialStatusSummary,
} from './helpers/trial-status';

// Time formatting utilities
export {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
  parseTimeToMs,
  formatTimeInputToMMSS,
} from './utils/timeFormatting';

// Date formatting utilities
export {
  formatDateMMDDYYYY,
  formatDateLocal,
  toYYYYMMDD,
  parseLocalDateString,
  getTodayLocal,
  isValidDateFormat,
  dateDifferenceInDays,
  formatDayAbbreviation,
  formatTime,
  formatTrialDate,
} from './utils/dateFormatting';

// Error handling utilities
export { ensureError, isErrorLike, getErrorMessage } from './utils/errors';

// Redaction utilities
export { redactSecretLikeString, redactSecretLikeValue } from './utils/redaction';

// Type guard utilities
export { isObject, isArray, assert, assertNever } from './utils/typeGuards';

// Search and filter utilities
export { matchesSearch, matchesAny, createDebouncedSearch } from './utils/search';

// Device detection utilities
export {
  detectDeviceCapabilities,
  getDeviceTier,
  type DeviceTier,
  type ConnectionSpeed,
  type ScreenSize,
  type DeviceCapabilities,
} from './utils/deviceDetection';

// Check-in status constants
export {
  CHECKIN_STATUSES,
  ENTRY_STATUSES,
  EXHIBITOR_ALLOWED_STATUSES,
  isCheckInStatus,
  isEntryStatus,
  isExhibitorAllowedStatus,
  type CheckInStatus,
  type EntryStatus,
} from './constants/check-in-status';

// Legacy passcode derivation
export { generatePasscodesFromShowId, type ShowPasscodes } from './utils/passcodes';

// Nationals scoring constants
export {
  NATIONALS_SCORING,
  NATIONALS_VALIDATION,
  type NationalsScoringConstants,
  type NationalsValidationConstants,
} from './constants/nationals';
