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
