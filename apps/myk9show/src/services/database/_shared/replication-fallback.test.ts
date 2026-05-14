import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withReplicationFallback } from './replication-fallback';

// Mock the supabaseClient module so logQuery/createDatabaseError are controllable in tests
vi.mock('../supabaseClient', () => ({
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown, table?: string, operation?: string) => {
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    return Object.assign(new Error(msg), { name: 'DatabaseError', table, operation });
  }),
}));

import { logQuery, createDatabaseError } from '../supabaseClient';

const mockLogQuery = vi.mocked(logQuery);
const mockCreateDatabaseError = vi.mocked(createDatabaseError);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Success path — replication succeeds
// ---------------------------------------------------------------------------

describe('withReplicationFallback — success path', () => {
  it('returns the replication result when replication succeeds', async () => {
    const replicationFn = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });
    const postgrestFn = vi.fn();

    const result = await withReplicationFallback(replicationFn, postgrestFn, 'shows', 'select_all');

    expect(result).toEqual({ data: [{ id: '1' }], error: null });
  });

  it('does NOT call postgrestFn when replication succeeds', async () => {
    const replicationFn = vi.fn().mockResolvedValue({ data: [], error: null });
    const postgrestFn = vi.fn();

    await withReplicationFallback(replicationFn, postgrestFn, 'shows', 'select_all');

    expect(postgrestFn).not.toHaveBeenCalled();
  });

  it('calls logQuery with the operation name (no error) on success', async () => {
    const replicationFn = vi.fn().mockResolvedValue({ data: 'ok', error: null });
    const postgrestFn = vi.fn();

    await withReplicationFallback(replicationFn, postgrestFn, 'trials', 'select_by_show');

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation, duration, errorArg] = mockLogQuery.mock.calls[0];
    expect(table).toBe('trials');
    expect(operation).toBe('select_by_show');
    expect(typeof duration).toBe('number');
    expect(errorArg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Fallback path — replication throws, PostgREST succeeds
// ---------------------------------------------------------------------------

describe('withReplicationFallback — fallback path', () => {
  it('returns the PostgREST result when replication throws', async () => {
    const replicationFn = vi.fn().mockRejectedValue(new Error('IndexedDB unavailable'));
    const postgrestFn = vi.fn().mockResolvedValue({ data: [{ id: '2' }], error: null });

    const result = await withReplicationFallback(replicationFn, postgrestFn, 'dogs', 'select_all');

    expect(result).toEqual({ data: [{ id: '2' }], error: null });
  });

  it('calls logQuery with the _fallback suffix on PostgREST success', async () => {
    const replicationFn = vi.fn().mockRejectedValue(new Error('store down'));
    const postgrestFn = vi.fn().mockResolvedValue({ data: [], error: null });

    await withReplicationFallback(replicationFn, postgrestFn, 'classes', 'search');

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation] = mockLogQuery.mock.calls[0];
    expect(table).toBe('classes');
    expect(operation).toBe('search_fallback');
  });

  it('does NOT call createDatabaseError when PostgREST fallback succeeds', async () => {
    const replicationFn = vi.fn().mockRejectedValue(new Error('store down'));
    const postgrestFn = vi.fn().mockResolvedValue({ data: [], error: null });

    await withReplicationFallback(replicationFn, postgrestFn, 'entries', 'select_by_show');

    expect(mockCreateDatabaseError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error path — both replication and PostgREST throw
// ---------------------------------------------------------------------------

describe('withReplicationFallback — error path', () => {
  it('throws a DatabaseError when both replication and PostgREST fail', async () => {
    const replicationFn = vi.fn().mockRejectedValue(new Error('store unavailable'));
    const postgrestFn = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(
      withReplicationFallback(replicationFn, postgrestFn, 'shows', 'select_by_id')
    ).rejects.toMatchObject({ name: 'DatabaseError' });
  });

  it('calls createDatabaseError with table and operation when both fail', async () => {
    const postgrestErr = new Error('network error');
    const replicationFn = vi.fn().mockRejectedValue(new Error('store unavailable'));
    const postgrestFn = vi.fn().mockRejectedValue(postgrestErr);

    try {
      await withReplicationFallback(replicationFn, postgrestFn, 'entries', 'select_all');
    } catch {
      // expected
    }

    expect(mockCreateDatabaseError).toHaveBeenCalledWith(postgrestErr, 'entries', 'select_all');
  });

  it('calls logQuery with the error message when both fail', async () => {
    const replicationFn = vi.fn().mockRejectedValue(new Error('store down'));
    const postgrestFn = vi.fn().mockRejectedValue(new Error('db down'));

    // createDatabaseError mock returns an Error with the postgrest message
    try {
      await withReplicationFallback(replicationFn, postgrestFn, 'trials', 'statistics');
    } catch {
      // expected
    }

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation, duration, errorMsg] = mockLogQuery.mock.calls[0];
    expect(table).toBe('trials');
    expect(operation).toBe('statistics');
    expect(typeof duration).toBe('number');
    expect(typeof errorMsg).toBe('string');
  });
});
