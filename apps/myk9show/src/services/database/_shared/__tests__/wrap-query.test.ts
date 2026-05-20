import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wrapQuery, wrapMutation } from '../wrap-query';

// Mock the supabaseClient module so logQuery/createDatabaseError are controllable in tests
vi.mock('../../supabaseClient', () => ({
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((error: unknown, table?: string, operation?: string) => {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message
            : 'Unknown error';
    return Object.assign(new Error(msg), { name: 'DatabaseError', table, operation });
  }),
}));

import { logQuery, createDatabaseError } from '../../supabaseClient';

const mockLogQuery = vi.mocked(logQuery);
const mockCreateDatabaseError = vi.mocked(createDatabaseError);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// wrapQuery — success path
// ---------------------------------------------------------------------------

describe('wrapQuery — success path', () => {
  it('returns { data, error: null } when the query succeeds', async () => {
    const fn = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null });

    const result = await wrapQuery('vaccination', 'select_all', [], fn);

    expect(result).toEqual({ data: [{ id: '1' }], error: null });
  });

  it('calls logQuery with no error message on success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: { id: '1' }, error: null });

    await wrapQuery('vaccination', 'select_by_id', null, fn);

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation, duration, errorArg] = mockLogQuery.mock.calls[0];
    expect(table).toBe('vaccination');
    expect(operation).toBe('select_by_id');
    expect(typeof duration).toBe('number');
    expect(errorArg).toBeUndefined();
  });

  it('returns the fallback when data is null on success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await wrapQuery<string[]>('vaccination', 'select_all', [], fn);

    expect(result).toEqual({ data: [], error: null });
  });

  it('does NOT call createDatabaseError on success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: [], error: null });

    await wrapQuery('vaccination', 'select_all', [], fn);

    expect(mockCreateDatabaseError).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// wrapQuery — Supabase error path
// ---------------------------------------------------------------------------

describe('wrapQuery — Supabase error path', () => {
  it('returns { data: fallback, error: dbError } when Supabase returns an error', async () => {
    const supabaseError = { message: 'permission denied', code: '42501' };
    const fn = vi.fn().mockResolvedValue({ data: null, error: supabaseError });

    const result = await wrapQuery<string[]>('vaccination', 'select_all', [], fn);

    expect(result.data).toEqual([]);
    expect(result.error).toMatchObject({ name: 'DatabaseError', message: 'permission denied' });
  });

  it('logs the Supabase error message', async () => {
    const supabaseError = { message: 'rls violation' };
    const fn = vi.fn().mockResolvedValue({ data: null, error: supabaseError });

    await wrapQuery('vaccination', 'insert', null, fn);

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation, , errorMsg] = mockLogQuery.mock.calls[0];
    expect(table).toBe('vaccination');
    expect(operation).toBe('insert');
    expect(errorMsg).toBe('rls violation');
  });

  it('calls createDatabaseError with the original error, table, and op', async () => {
    const supabaseError = { message: 'boom' };
    const fn = vi.fn().mockResolvedValue({ data: null, error: supabaseError });

    await wrapQuery('vaccination', 'update', null, fn);

    expect(mockCreateDatabaseError).toHaveBeenCalledWith(supabaseError, 'vaccination', 'update');
  });
});

// ---------------------------------------------------------------------------
// wrapQuery — thrown error path
// ---------------------------------------------------------------------------

describe('wrapQuery — thrown error path', () => {
  it('returns { data: fallback, error: dbError } when fn throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await wrapQuery<string[]>('vaccination', 'select_all', [], fn);

    expect(result.data).toEqual([]);
    expect(result.error).toMatchObject({ name: 'DatabaseError', message: 'network down' });
  });

  it('logs the thrown error message with timing', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('connection refused'));

    await wrapQuery('vaccination', 'select_all', [], fn);

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [, , duration, errorMsg] = mockLogQuery.mock.calls[0];
    expect(typeof duration).toBe('number');
    expect(errorMsg).toBe('connection refused');
  });
});

// ---------------------------------------------------------------------------
// wrapQuery — timing
// ---------------------------------------------------------------------------

describe('wrapQuery — timing', () => {
  it('records a non-negative duration on success', async () => {
    const fn = vi.fn().mockResolvedValue({ data: [], error: null });

    await wrapQuery('vaccination', 'select_all', [], fn);

    const [, , duration] = mockLogQuery.mock.calls[0];
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  it('records a non-negative duration on error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('blew up'));

    await wrapQuery('vaccination', 'select_all', [], fn);

    const [, , duration] = mockLogQuery.mock.calls[0];
    expect(typeof duration).toBe('number');
    expect(duration).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// wrapMutation — preserves the { error } shape
// ---------------------------------------------------------------------------

describe('wrapMutation', () => {
  it('returns { error: null } on success', async () => {
    const fn = vi.fn().mockResolvedValue({ error: null });

    const result = await wrapMutation('vaccination', 'delete', fn);

    expect(result).toEqual({ error: null });
    expect(mockCreateDatabaseError).not.toHaveBeenCalled();
  });

  it('returns { error: dbError } when Supabase returns an error', async () => {
    const supabaseError = { message: 'cannot delete' };
    const fn = vi.fn().mockResolvedValue({ error: supabaseError });

    const result = await wrapMutation('vaccination', 'delete', fn);

    expect(result.error).toMatchObject({ name: 'DatabaseError', message: 'cannot delete' });
  });

  it('returns { error: dbError } when fn throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await wrapMutation('vaccination', 'delete', fn);

    expect(result.error).toMatchObject({ name: 'DatabaseError', message: 'network down' });
  });

  it('logs the operation on success with no error message', async () => {
    const fn = vi.fn().mockResolvedValue({ error: null });

    await wrapMutation('vaccination', 'delete', fn);

    expect(mockLogQuery).toHaveBeenCalledTimes(1);
    const [table, operation, , errorArg] = mockLogQuery.mock.calls[0];
    expect(table).toBe('vaccination');
    expect(operation).toBe('delete');
    expect(errorArg).toBeUndefined();
  });
});
