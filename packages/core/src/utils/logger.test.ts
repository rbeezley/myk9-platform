import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger, configureLogger, setLogLevel } from './logger';

/**
 * Reset the logger to a known state.
 * Note: configureLogger only updates settingsReader if the value is !== undefined,
 * so we pass a reader that returns the desired level to ensure it's overridden.
 */
function resetLogger() {
  configureLogger({
    isDev: false,
    level: 'errors',
    settingsReader: () => 'errors',
  });
}

/**
 * Clear the settingsReader by setting a reader that returns the current level,
 * then switch to direct level control.
 */
function clearSettingsReader(level: 'none' | 'errors' | 'all') {
  // Override any previous settingsReader
  configureLogger({ level, settingsReader: () => level });
}

describe('logger', () => {
  beforeEach(() => {
    resetLogger();
    vi.restoreAllMocks();
  });

  describe('configureLogger', () => {
    it('should set isDev flag', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      configureLogger({ isDev: true, settingsReader: () => 'all' });
      logger.log('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should set log level', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      configureLogger({ settingsReader: () => 'none' });
      logger.error('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should set settingsReader', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      configureLogger({
        isDev: true,
        settingsReader: () => 'all',
      });
      logger.log('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should only update provided options', () => {
      // Start with known state: isDev=true, level=all via reader
      configureLogger({ isDev: true, settingsReader: () => 'all' });

      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.log('visible');
      expect(logSpy).toHaveBeenCalledWith('visible');

      // Now set isDev=false without changing settingsReader
      configureLogger({ isDev: false });
      logSpy.mockClear();
      logger.log('hidden');
      // 'all' level requires isDev=true, so this should be suppressed
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('setLogLevel', () => {
    it('should change the log level used by settingsReader fallback', () => {
      // Clear settingsReader by setting one that throws (to test fallback)
      configureLogger({
        settingsReader: () => { throw new Error('unavailable'); },
      });
      setLogLevel('none');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      // error checks getLogLevel() !== 'none', fallback returns 'none'
      expect(spy).not.toHaveBeenCalled();
    });

    it('should allow switching between levels', () => {
      configureLogger({
        settingsReader: () => { throw new Error('unavailable'); },
      });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      setLogLevel('none');
      logger.warn('suppressed');
      expect(warnSpy).not.toHaveBeenCalled();

      setLogLevel('errors');
      logger.warn('visible');
      expect(warnSpy).toHaveBeenCalledWith('visible');
    });
  });

  describe('level: none', () => {
    beforeEach(() => {
      clearSettingsReader('none');
    });

    it('should suppress logger.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.log('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should suppress logger.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should suppress logger.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should suppress logger.debug', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.debug('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should suppress logger.info', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('test');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('level: errors', () => {
    beforeEach(() => {
      clearSettingsReader('errors');
    });

    it('should suppress logger.log', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.log('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should allow logger.warn', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should allow logger.error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should suppress logger.debug', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.debug('test');
      expect(spy).not.toHaveBeenCalled();
    });

    it('should suppress logger.info', () => {
      const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.info('test');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('level: all', () => {
    it('should suppress all output when isDev is false', () => {
      configureLogger({ isDev: false, settingsReader: () => 'all' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      logger.log('test');
      logger.info('test');
      logger.debug('test');
      expect(logSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('should allow all output when isDev is true', () => {
      configureLogger({ isDev: true, settingsReader: () => 'all' });
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      logger.log('log-msg');
      logger.warn('warn-msg');
      logger.error('error-msg');
      logger.info('info-msg');

      expect(logSpy).toHaveBeenCalledWith('log-msg');
      expect(warnSpy).toHaveBeenCalledWith('warn-msg');
      expect(errorSpy).toHaveBeenCalledWith('error-msg');
      expect(infoSpy).toHaveBeenCalledWith('info-msg');
    });

    it('should prefix debug messages with [DEBUG]', () => {
      configureLogger({ isDev: true, settingsReader: () => 'all' });
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.debug('debug-msg');
      expect(spy).toHaveBeenCalledWith('[DEBUG]', 'debug-msg');
    });
  });

  describe('settingsReader', () => {
    it('should use settingsReader over static level', () => {
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
      configureLogger({
        isDev: true,
        level: 'none',
        settingsReader: () => 'all',
      });
      logger.log('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should fall back to static level if settingsReader throws', () => {
      configureLogger({
        level: 'errors',
        settingsReader: () => {
          throw new Error('settings unavailable');
        },
      });
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('fallback');
      expect(spy).toHaveBeenCalledWith('fallback');
    });
  });

  describe('multiple arguments', () => {
    it('should pass multiple arguments to console methods', () => {
      clearSettingsReader('errors');
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('message', { data: 42 }, [1, 2, 3]);
      expect(spy).toHaveBeenCalledWith('message', { data: 42 }, [1, 2, 3]);
    });

    it('should pass multiple arguments to error', () => {
      clearSettingsReader('errors');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('err', new Error('test'));
      expect(spy).toHaveBeenCalledWith('err', expect.any(Error));
    });
  });

  describe('logger.error special behavior', () => {
    it('should log errors at errors level', () => {
      clearSettingsReader('errors');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should log errors at all level regardless of isDev', () => {
      // error has special behavior: logs whenever setting !== 'none'
      configureLogger({ isDev: false, settingsReader: () => 'all' });
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).toHaveBeenCalledWith('test');
    });

    it('should suppress errors only at none level', () => {
      clearSettingsReader('none');
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
