import { describe, expect, it } from 'vitest';
import {
  classifyEmptyUpdateResult,
  ContainmentError,
  CONTAINMENT_DEFAULT_RETRY_AFTER_MS,
  getConflictServerVersion,
  getReturnedServerVersion,
  isContainmentError,
  isVersionConflictError,
  OccRejectionError,
  parseContainmentRetryAfterMs,
} from './mutation-occ';

// MYK9-115 Task 3. The server has raised RS429 while contained since
// 2026-07-31; until now no client recognised it, so a contained scoring write
// fell through the generic retry path, exhausted its budget and dead-lettered
// without ever advancing its OCC token.
describe('isContainmentError', () => {
  it('matches the RS429 PostgREST error shape', () => {
    expect(
      isContainmentError({ code: 'RS429', message: 'Ringside scoring contained; retries paused' })
    ).toBe(true);
  });

  it('does not match ordinary version conflicts or other errors', () => {
    expect(
      isContainmentError({
        code: '40001',
        message: 'Version conflict updating entry x (expected 1)',
      })
    ).toBe(false);
    expect(isContainmentError(new Error('network'))).toBe(false);
    expect(isContainmentError(null)).toBe(false);
    expect(isContainmentError(undefined)).toBe(false);
  });

  it('RS429 is not classified as a version conflict', () => {
    // Containment and conflict need different handling: a conflict retries with
    // a fresh token, containment must PAUSE. Routing RS429 into the OCC path
    // would hammer the very breaker that is asking the client to stop.
    expect(
      isContainmentError({ code: 'RS429', message: 'Ringside scoring contained; retries paused' })
    ).toBe(true);
    expect(
      isVersionConflictError({
        code: 'RS429',
        message: 'Ringside scoring contained; retries paused',
      })
    ).toBe(false);
  });

  it('is not fooled by the containment message alone without the code', () => {
    expect(isContainmentError({ message: 'Ringside scoring contained; retries paused' })).toBe(
      false
    );
  });
});

describe('ContainmentError', () => {
  it('carries the authoritative version and a retry-after', () => {
    const err = new ContainmentError('entries', 'row-1', 7, 60_000);
    expect(err.currentServerVersion).toBe(7);
    expect(err.retryAfterMs).toBe(60_000);
    expect(err.tableName).toBe('entries');
    expect(err.rowId).toBe('row-1');
    expect(err.name).toBe('ContainmentError');
  });

  it('is not an OccRejectionError, so the conflict handler cannot claim it', () => {
    const err = new ContainmentError('entries', 'row-1', 7, 60_000);
    expect(err).not.toBeInstanceOf(OccRejectionError);
    expect(isVersionConflictError(err)).toBe(false);
  });
});

describe('parseContainmentRetryAfterMs', () => {
  it('reads seconds from the HINT and converts to ms', () => {
    expect(parseContainmentRetryAfterMs({ hint: 'retry_after=60' })).toBe(60_000);
    expect(parseContainmentRetryAfterMs({ hint: 'retry_after=5' })).toBe(5_000);
  });

  it('falls back to the default rather than retrying immediately', () => {
    // A missing or junk hint must never collapse to 0 — that would turn the
    // breaker's "pause" into a tight retry loop.
    expect(parseContainmentRetryAfterMs({ hint: undefined })).toBe(
      CONTAINMENT_DEFAULT_RETRY_AFTER_MS
    );
    expect(parseContainmentRetryAfterMs({})).toBe(CONTAINMENT_DEFAULT_RETRY_AFTER_MS);
    expect(parseContainmentRetryAfterMs({ hint: 'nonsense' })).toBe(
      CONTAINMENT_DEFAULT_RETRY_AFTER_MS
    );
    expect(parseContainmentRetryAfterMs({ hint: 'retry_after=-5' })).toBe(
      CONTAINMENT_DEFAULT_RETRY_AFTER_MS
    );
    expect(parseContainmentRetryAfterMs(null)).toBe(CONTAINMENT_DEFAULT_RETRY_AFTER_MS);
  });
});

describe('OccRejectionError', () => {
  it('preserves the current error message and metadata', () => {
    const error = new OccRejectionError('entries', 'entry-1', 7);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OccRejectionError');
    expect(error.message).toBe('OCC rejection: entries/entry-1 (expected server version 7)');
    expect(error.tableName).toBe('entries');
    expect(error.rowId).toBe('entry-1');
    expect(error.expectedVersion).toBe(7);
  });

  it('carries the freshly re-read server version for token advancement', () => {
    const error = new OccRejectionError('entries', 'entry-1', 3, 8);
    expect(error.currentServerVersion).toBe(8);
  });
});

describe('isVersionConflictError', () => {
  it('matches the raw 40001 the ringside RPC raises (by code or message)', () => {
    expect(isVersionConflictError({ code: '40001', message: 'whatever' })).toBe(true);
    expect(
      isVersionConflictError({ message: 'Version conflict updating entry e (expected 3)' })
    ).toBe(true);
  });

  it('matches an already-classified OccRejectionError', () => {
    expect(isVersionConflictError(new OccRejectionError('entries', 'e', 3, 8))).toBe(true);
  });

  it('does not match unrelated errors (RLS denial, nullish)', () => {
    expect(isVersionConflictError({ code: '42501', message: 'Not authorized' })).toBe(false);
    expect(isVersionConflictError(new Error('RLS policy blocked'))).toBe(false);
    expect(isVersionConflictError(null)).toBe(false);
    expect(isVersionConflictError(undefined)).toBe(false);
  });
});

describe('getConflictServerVersion', () => {
  it('reads the current server version the RPC puts in error.details', () => {
    expect(getConflictServerVersion({ code: '40001', details: '8' })).toBe(8);
    expect(getConflictServerVersion({ code: '40001', details: ' 12 ' })).toBe(12);
  });

  it('reads currentServerVersion off an OccRejectionError', () => {
    expect(getConflictServerVersion(new OccRejectionError('entries', 'e', 3, 9))).toBe(9);
  });

  it('returns undefined when no usable version is present', () => {
    // Function version predating the DETAIL change — no version to advance to.
    expect(getConflictServerVersion({ code: '40001', message: 'conflict' })).toBeUndefined();
    expect(getConflictServerVersion({ code: '40001', details: 'not-a-number' })).toBeUndefined();
    expect(getConflictServerVersion(null)).toBeUndefined();
  });
});

describe('classifyEmptyUpdateResult', () => {
  it('returns the current row-missing error when the server re-check finds no row', () => {
    const result = classifyEmptyUpdateResult({
      tableName: 'entries',
      rowId: 'entry-1',
      serverVersion: 7,
      serverCheck: null,
    });

    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Row entry-1 on entries no longer exists server-side.');
  });

  it('returns an OCC rejection when the server version advanced', () => {
    const result = classifyEmptyUpdateResult({
      tableName: 'entries',
      rowId: 'entry-1',
      serverVersion: 7,
      serverCheck: { version: 8 },
    });

    expect(result).toBeInstanceOf(OccRejectionError);
    expect(result.message).toBe('OCC rejection: entries/entry-1 (expected server version 7)');
  });

  it('returns an RLS/auth error when the server re-check itself fails', () => {
    const result = classifyEmptyUpdateResult({
      tableName: 'entries',
      rowId: 'entry-1',
      serverVersion: 7,
      serverCheck: null,
      serverCheckError: { code: '42501', message: 'permission denied' },
    });

    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(OccRejectionError);
    expect(result.message).toBe(
      'RLS policy blocked UPDATE on entries for row entry-1. Check that the authenticated user has the required role.'
    );
  });

  it('returns the current RLS error when the version is unchanged', () => {
    const result = classifyEmptyUpdateResult({
      tableName: 'entries',
      rowId: 'entry-1',
      serverVersion: 7,
      serverCheck: { version: 7 },
    });

    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(OccRejectionError);
    expect(result.message).toBe(
      'RLS policy blocked UPDATE on entries for row entry-1. Check that the authenticated user has the required role.'
    );
  });

  it('returns the current RLS error when no serverVersion precondition exists', () => {
    const result = classifyEmptyUpdateResult({
      tableName: 'entries',
      rowId: 'entry-1',
      serverVersion: undefined,
      serverCheck: { version: 8 },
    });

    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(OccRejectionError);
    expect(result.message).toBe(
      'RLS policy blocked UPDATE on entries for row entry-1. Check that the authenticated user has the required role.'
    );
  });
});

describe('getReturnedServerVersion', () => {
  it('extracts version from the first returned update row', () => {
    expect(getReturnedServerVersion([{ version: 12 }])).toBe(12);
  });

  it('returns undefined when no row or version is returned', () => {
    expect(getReturnedServerVersion([])).toBeUndefined();
    expect(getReturnedServerVersion([{}])).toBeUndefined();
  });
});
