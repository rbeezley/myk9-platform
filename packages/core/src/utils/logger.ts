/* eslint-disable no-console */

/**
 * Preserve the package logger's production policy: warnings and errors only.
 */
function shouldLog(level: 'log' | 'warn' | 'error' | 'debug' | 'info'): boolean {
  return level === 'warn' || level === 'error';
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
    console.error(...args);
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
  },
};

// Export individual functions for convenience
export const { log, warn, error, debug, info } = logger;
