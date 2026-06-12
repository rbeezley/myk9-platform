import { describe, expect, it } from 'vitest';
import {
  classifyEmptyUpdateResult,
  getReturnedServerVersion,
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
