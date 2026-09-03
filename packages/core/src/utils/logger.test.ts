import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('level: errors', () => {
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

  describe('multiple arguments', () => {
    it('should pass multiple arguments to console methods', () => {
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      logger.warn('message', { data: 42 }, [1, 2, 3]);
      expect(spy).toHaveBeenCalledWith('message', { data: 42 }, [1, 2, 3]);
    });

    it('should pass multiple arguments to error', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('err', new Error('test'));
      expect(spy).toHaveBeenCalledWith('err', expect.any(Error));
    });
  });

  describe('logger.error special behavior', () => {
    it('should log errors at errors level', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      logger.error('test');
      expect(spy).toHaveBeenCalledWith('test');
    });
  });
});
