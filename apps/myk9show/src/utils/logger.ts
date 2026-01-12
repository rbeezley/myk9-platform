import { logger } from '@/services/LoggingService';

/**
 * Simple logger utility for myK9Show
 *
 * Provides consistent logging with optional debug mode.
 */

const DEBUG = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (DEBUG) {
      logger.debug('...args', 'utils', { ...args: ...args });
    }
  },

  warn: (...args: unknown[]) => {
    logger.warn('...args', 'utils', { ...args: ...args });
  },

  error: (...args: unknown[]) => {
    logger.error('...args', 'utils', { ...args: ...args });
  },

  debug: (...args: unknown[]) => {
    if (DEBUG) {
      console.debug(...args);
    }
  },
};
