/**
 * Rate Limiter for Brute Force Protection
 *
 * Protects against automated passcode guessing attacks by:
 * 1. Limiting login attempts per time window
 * 2. Applying progressive delays after failed attempts
 * 3. Temporarily blocking after excessive failures
 * 4. Tracking attempts in localStorage (survives page refresh)
 *
 * Security Note: This is client-side protection only. For production,
 * server-side rate limiting (IP-based) should also be implemented.
 */

export interface RateLimitConfig {
  /** Maximum failed attempts before blocking */
  maxAttempts: number;
  /** Time window for counting attempts (milliseconds) */
  windowMs: number;
  /** Duration of temporary block after max attempts (milliseconds) */
  blockDurationMs: number;
  /** Progressive delay multiplier (ms per failed attempt) */
  delayMultiplier: number;
}

export interface RateLimitState {
  /** Number of failed attempts in current window */
  attempts: number;
  /** Timestamp of first attempt in current window */
  firstAttemptTime: number;
  /** Timestamp when block expires (if blocked) */
  blockedUntil: number | null;
  /** Timestamp of last failed attempt */
  lastAttemptTime: number;
}

export interface RateLimitResult {
  /** Whether the attempt is allowed */
  allowed: boolean;
  /** Remaining attempts before block */
  remainingAttempts: number;
  /** Delay in milliseconds before next attempt allowed */
  delayMs: number;
  /** Time remaining in block (milliseconds), if blocked */
  blockTimeRemaining: number;
  /** Human-readable message */
  message: string;
}

// Default configuration - aggressive to protect against bots
const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,              // 5 failed attempts
  windowMs: 15 * 60 * 1000,    // 15 minute window
  blockDurationMs: 30 * 60 * 1000, // 30 minute block
  delayMultiplier: 1000,       // 1 second per failed attempt
};

const STORAGE_KEY_PREFIX = 'myK9Q_rate_limit_';

/**
 * Gets the current rate limit state for a given action
 */
function getRateLimitState(action: string): RateLimitState {
  const key = `${STORAGE_KEY_PREFIX}${action}`;
  const stored = localStorage.getItem(key);

  if (!stored) {
    return {
      attempts: 0,
      firstAttemptTime: 0,
      blockedUntil: null,
      lastAttemptTime: 0,
    };
  }

  try {
    return JSON.parse(stored);
  } catch {
    // Invalid data, reset
    return {
      attempts: 0,
      firstAttemptTime: 0,
      blockedUntil: null,
      lastAttemptTime: 0,
    };
  }
}

/**
 * Saves the rate limit state for a given action
 */
function saveRateLimitState(action: string, state: RateLimitState): void {
  const key = `${STORAGE_KEY_PREFIX}${action}`;
  localStorage.setItem(key, JSON.stringify(state));
}

/**
 * Clears the rate limit state for a given action (on successful login)
 */
export function clearRateLimit(action: string): void {
  const key = `${STORAGE_KEY_PREFIX}${action}`;
  localStorage.removeItem(key);
}

/**
 * Checks if an action is rate limited and returns detailed status
 *
 * @param action - The action to check (e.g., 'login')
 * @param config - Optional rate limit configuration
 * @returns RateLimitResult with allowed status and details
 */
export function checkRateLimit(
  action: string,
  config: Partial<RateLimitConfig> = {}
): RateLimitResult {
  const fullConfig: RateLimitConfig = { ...DEFAULT_CONFIG, ...config };
  const state = getRateLimitState(action);
  const now = Date.now();

  // Check if currently blocked
  if (state.blockedUntil && now < state.blockedUntil) {
    const blockTimeRemaining = state.blockedUntil - now;
    const minutesRemaining = Math.ceil(blockTimeRemaining / 60000);

    return {
      allowed: false,
      remainingAttempts: 0,
      delayMs: 0,
      blockTimeRemaining,
      message: `Too many failed attempts. Please try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
    };
  }

  // Reset if window has expired
  if (state.attempts > 0 && now - state.firstAttemptTime > fullConfig.windowMs) {
    const resetState: RateLimitState = {
      attempts: 0,
      firstAttemptTime: 0,
      blockedUntil: null,
      lastAttemptTime: 0,
    };
    saveRateLimitState(action, resetState);

    return {
      allowed: true,
      remainingAttempts: fullConfig.maxAttempts,
      delayMs: 0,
      blockTimeRemaining: 0,
      message: 'Attempt allowed',
    };
  }

  // Check if max attempts reached
  if (state.attempts >= fullConfig.maxAttempts) {
    const blockedUntil = now + fullConfig.blockDurationMs;
    const blockedState: RateLimitState = {
      ...state,
      blockedUntil,
    };
    saveRateLimitState(action, blockedState);

    const minutesBlocked = Math.ceil(fullConfig.blockDurationMs / 60000);

    return {
      allowed: false,
      remainingAttempts: 0,
      delayMs: 0,
      blockTimeRemaining: fullConfig.blockDurationMs,
      message: `Too many failed attempts. Access blocked for ${minutesBlocked} minutes.`,
    };
  }

  // Progressive delay based on failed attempts
  const delayMs = state.attempts * fullConfig.delayMultiplier;
  const timeSinceLastAttempt = now - state.lastAttemptTime;

  if (delayMs > 0 && timeSinceLastAttempt < delayMs) {
    const remainingDelay = delayMs - timeSinceLastAttempt;
    const secondsRemaining = Math.ceil(remainingDelay / 1000);

    return {
      allowed: false,
      remainingAttempts: fullConfig.maxAttempts - state.attempts,
      delayMs: remainingDelay,
      blockTimeRemaining: 0,
      message: `Please wait ${secondsRemaining} second${secondsRemaining === 1 ? '' : 's'} before trying again.`,
    };
  }

  // Attempt allowed
  return {
    allowed: true,
    remainingAttempts: fullConfig.maxAttempts - state.attempts,
    delayMs: 0,
    blockTimeRemaining: 0,
    message: 'Attempt allowed',
  };
}

/**
 * Records a failed attempt for rate limiting
 *
 * @param action - The action that failed (e.g., 'login')
 */
export function recordFailedAttempt(action: string): void {
  const state = getRateLimitState(action);
  const now = Date.now();

  const newState: RateLimitState = {
    attempts: state.attempts === 0 ? 1 : state.attempts + 1,
    firstAttemptTime: state.attempts === 0 ? now : state.firstAttemptTime,
    blockedUntil: state.blockedUntil,
    lastAttemptTime: now,
  };

  saveRateLimitState(action, newState);
}

/**
 * Gets a human-readable status message for display
 *
 * @param action - The action to check
 * @returns Status message with remaining attempts
 */
export function getRateLimitStatus(action: string): string {
  const state = getRateLimitState(action);
  const result = checkRateLimit(action);

  if (!result.allowed) {
    return result.message;
  }

  if (state.attempts > 0) {
    const remaining = DEFAULT_CONFIG.maxAttempts - state.attempts;
    return `${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary block.`;
  }

  return '';
}

/**
 * Clears all rate limit data (useful for testing or admin override)
 */
export function clearAllRateLimits(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      localStorage.removeItem(key);
    }
  });
}
