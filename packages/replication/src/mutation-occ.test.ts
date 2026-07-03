import { describe, expect, it } from 'vitest';
import {
  classifyEmptyUpdateResult,
  getConflictServerVersion,
  getReturnedServerVersion,
  isVersionConflictError,
  OccRejectionError,
} from './mutation-occ';

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
