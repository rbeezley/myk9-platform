/**
 * Simple logger utility for myK9Show
 *
 * Provides consistent logging with optional debug mode.
 */

const DEBUG = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => {
    if (DEBUG) {
      console.log(...args);
    }
  },

  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  error: (...args: unknown[]) => {
    console.error(...args);
  },

  debug: (...args: unknown[]) => {
    if (DEBUG) {
      console.debug(...args);
    }
  },
};
