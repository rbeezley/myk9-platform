import { describe, expect, it, vi } from 'vitest';
import { isColdInsertAllowed, ShowScopedColdInsertError } from './coldInsertGuard';

function makeLogger() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('isColdInsertAllowed (MYK9-575)', () => {
  it('lets an account-scoped table (mode null) insert freely', () => {
    const logger = makeLogger();

    expect(
      isColdInsertAllowed({
        mode: null,
        tableName: 'dogs',
        rowId: 'dog-1',
        options: undefined,
        logger,
      })
    ).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('throws on an un-opted-in cold insert in throw mode', () => {
    const logger = makeLogger();

    expect(() =>
      isColdInsertAllowed({
        mode: 'throw',
        tableName: 'entries',
        rowId: 'entry-1',
        options: undefined,
        logger,
      })
    ).toThrow(ShowScopedColdInsertError);
  });

  it('logs and refuses without throwing in skip mode (never crash a show-day write)', () => {
    const logger = makeLogger();

    const allowed = isColdInsertAllowed({
      mode: 'skip',
      tableName: 'entries',
      rowId: 'entry-1',
      options: undefined,
      logger,
    });

    expect(allowed).toBe(false);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).toMatch(/cold single-row INSERT/i);
  });

  it('allows an opted-in insert in BOTH modes and logs the reason', () => {
    for (const mode of ['throw', 'skip'] as const) {
      const logger = makeLogger();

      expect(
        isColdInsertAllowed({
          mode,
          tableName: 'entries',
          rowId: 'entry-1',
          options: { allowColdInsert: 'local create of a new entry' },
          logger,
        })
      ).toBe(true);
      expect(String(logger.log.mock.calls[0]?.[0])).toContain('local create of a new entry');
    }
  });
});
