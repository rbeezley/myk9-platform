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

/**
 * `log`, `debug` and `info` are no-ops BY POLICY, not stubs. Until MYK9-328
 * this package exported `configureLogger` / `setLogLevel`, and a level of
 * `'all'` made all three reach `console`. That surface was removed, the policy
 * was hardcoded to warn-and-error, and the three `console.*` calls behind it
 * became unreachable — dead code that read as working behaviour and that no
 * test could ever cover. The bodies are now gone.
 *
 * These assertions exist so that stays deliberate: they pin the signature
 * (variadic, returns undefined, never throws) so a caller cannot break, and
 * the suppression assertions above pin the policy.
 */
describe('suppressed levels are no-ops, not stubs', () => {
  it.each(['log', 'debug', 'info'] as const)('%s accepts arguments and returns undefined', name => {
    expect(logger[name]('message', { data: 42 }, [1, 2, 3])).toBeUndefined();
  });

  it.each(['log', 'debug', 'info'] as const)('%s never throws', name => {
    expect(() => logger[name]()).not.toThrow();
  });

  it('writes to no console method at all', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(method =>
      vi.spyOn(console, method).mockImplementation(() => {})
    );
    // Clear AFTER creating them. `console` is a shared global and this file's
    // other tests spy on the same methods, so a spy can arrive carrying an
    // earlier test's calls — this assertion passed alone and failed in the
    // full file until the clear was added. The package runs with
    // `--sequence.shuffle` in CI, where that is a random failure with no code
    // change to blame.
    for (const spy of spies) spy.mockClear();
    logger.log('a');
    logger.debug('b');
    logger.info('c');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
