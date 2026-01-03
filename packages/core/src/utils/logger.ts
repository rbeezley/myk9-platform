/* eslint-disable no-console */
/**
 * Production-safe logging utility
 *
 * Provides configurable logging levels for development and production.
 * Can be configured via setLogLevel() or respects app-specific settings.
 */

type LogLevel = 'none' | 'errors' | 'all';

// Default configuration
let currentLogLevel: LogLevel = 'errors';
let isDev = false;

// Allow apps to configure these at startup
let settingsReader: (() => LogLevel) | null = null;

/**
 * Configure the logger
 */
export function configureLogger(options: {
  isDev?: boolean;
  level?: LogLevel;
  settingsReader?: () => LogLevel;
}) {
  if (options.isDev !== undefined) isDev = options.isDev;
  if (options.level !== undefined) currentLogLevel = options.level;
  if (options.settingsReader !== undefined) settingsReader = options.settingsReader;
}

/**
 * Set the log level directly
 */
export function setLogLevel(level: LogLevel) {
  currentLogLevel = level;
}

/**
 * Get current console logging setting
 */
function getLogLevel(): LogLevel {
  // If a settings reader is configured, use it
  if (settingsReader) {
    try {
      return settingsReader();
    } catch {
      // Fall back to current level
    }
  }
  return currentLogLevel;
}

/**
 * Check if logging is allowed based on settings and environment
 */
function shouldLog(level: 'log' | 'warn' | 'error' | 'debug' | 'info'): boolean {
  const setting = getLogLevel();

  // None = no logging at all (except critical errors)
  if (setting === 'none') {
    return false;
  }

  // Errors = only errors and warnings
  if (setting === 'errors') {
    return level === 'error' || level === 'warn';
  }

  // All = everything in dev mode
  if (setting === 'all') {
    return isDev;
  }

  return false;
}

export const logger = {
  log: (...args: unknown[]) => {
    if (shouldLog('log')) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    // Always log errors unless explicitly disabled
    const setting = getLogLevel();
    if (setting !== 'none') {
      console.error(...args);
    }
  },
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) {
      console.info(...args);
    }
  }
};

// Export individual functions for convenience
export const { log, warn, error, debug, info } = logger;
