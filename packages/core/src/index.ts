/**
 * @myk9/core
 *
 * Core utilities, types, and constants for the myK9 Platform.
 */

// Logger
export {
  logger,
  log,
  warn,
  error,
  debug,
  info,
  configureLogger,
  setLogLevel,
} from './utils/logger';

// Network utilities
export {
  withTimeout,
  withRetry,
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
  RETRY_PRESETS,
  type RetryOptions,
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
  CLASS_STATUS_DISPLAY,
  CLASS_STATUS_ORDER,
  getNextClassStatus,
  getClassStatusDisplay,
  getClassStatusBadgeClasses,
  LEGACY_STATUS_MAP,
  normalizeClassStatus,
  type ClassStatusValue,
} from './constants/class-status';

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
  formatDateDisplay,
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
export {
  ensureError,
  isErrorLike,
  getErrorMessage,
} from './utils/errors';

// Type guard utilities
export {
  isDefined,
  assertDefined,
  isObject,
  hasProperty,
  isString,
  isNumber,
  isBoolean,
  isArray,
  isArrayOf,
  isFunction,
  isDate,
  isPromise,
  isNullish,
  hasRequiredProperties,
  safeGet,
  assert,
  assertNever,
} from './utils/typeGuards';

// Search and filter utilities
export {
  matchesSearch,
  matchesAny,
  createSearchFilter,
  filterBySearchTerm,
  normalizeSearchTerm,
  createDebouncedSearch,
} from './utils/search';

// Device detection utilities
export {
  detectDeviceCapabilities,
  getDeviceTier,
  resetDeviceDetection,
  type DeviceTier,
  type ConnectionSpeed,
  type ScreenSize,
  type DeviceCapabilities,
} from './utils/deviceDetection';

// Notification sound service (no-op stub — apps can provide real implementations)
export {
  notificationSoundService,
  type NotificationSoundServiceInterface,
} from './services/notificationSoundService';

// Voice announcement service (no-op stub — apps can provide real implementations)
export {
  default as voiceAnnouncementService,
  type VoiceAnnouncementServiceInterface,
} from './services/voiceAnnouncementService';

// Nationals scoring service (types + no-op stub)
export {
  nationalsScoring,
  type ElementType,
  type CompetitionDay,
  type NationalsScore,
  type NationalsRanking,
  type NationalsScoringInterface,
} from './services/nationalsScoring';
