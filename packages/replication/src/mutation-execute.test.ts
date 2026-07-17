import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { executeMutation, isPrimaryKeyDuplicateError } from './mutation-execute';
import { OccRejectionError } from './mutation-occ';
import type { Logger } from './dependencies';
import type { PendingMutation } from './types';

function makeMutation(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 'mutation-1',
    tableName: 'entries',
    operation: 'INSERT',
    rowId: 'entry-1',
    data: { id: 'entry-1', name: 'Test' },
    timestamp: Date.now(),
    retries: 0,
    status: 'pending',
    ...overrides,
  };
}

function makeLogger(): Logger {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;
}

/**
 * Builds a chainable query-builder stub: `.eq()` returns itself (so it
 * supports zero, one, or two chained `.eq()` calls before `.select()`), and
 * `.select()` / `.maybeSingle()` resolve to the given result.
 */
function chainable(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.eq = vi.fn(() => node);
  node.select = vi.fn(() => Promise.resolve(result));
  node.maybeSingle = vi.fn(() => Promise.resolve(result));
  return node;
}

describe('isPrimaryKeyDuplicateError', () => {
  it('matches a 23505 error naming the table primary key', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "entries_pkey"',
    };
    expect(isPrimaryKeyDuplicateError(error, 'entries', 'entry-1')).toBe(true);
  });

  it('matches a 23505 error whose detail names the row id via key (id)=', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "some_other_constraint"',
      details: 'Key (id)=(entry-1) already exists.',
    };
    expect(isPrimaryKeyDuplicateError(error, 'entries', 'entry-1')).toBe(true);
  });

  it('is case-insensitive when matching the table pkey and row id', () => {
    const error = { code: '23505', message: 'violates unique constraint "ENTRIES_PKEY"' };
    expect(isPrimaryKeyDuplicateError(error, 'entries', 'ENTRY-1')).toBe(true);
  });

  it('does not match a 23505 error for a different constraint/row', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "entries_armband_unique"',
      details: 'Key (id)=(some-other-id) already exists.',
    };
    expect(isPrimaryKeyDuplicateError(error, 'entries', 'entry-1')).toBe(false);
  });

  it('does not match a non-23505 error code', () => {
    expect(
      isPrimaryKeyDuplicateError({ code: '42501', message: 'entries_pkey' }, 'entries', 'entry-1')
    ).toBe(false);
  });

  it('handles null/undefined errors safely', () => {
    expect(isPrimaryKeyDuplicateError(null, 'entries', 'entry-1')).toBe(false);
    expect(isPrimaryKeyDuplicateError(undefined, 'entries', 'entry-1')).toBe(false);
  });
});

describe('executeMutation', () => {
  describe('INSERT', () => {
    it('returns {} on a successful insert', async () => {
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [{ id: 'entry-1' }], error: null })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const result = await executeMutation(supabase, makeLogger(), makeMutation());
      expect(result).toEqual({});
    });

    it('treats a primary-key duplicate error as success (idempotent retry)', async () => {
      const dupError = { code: '23505', message: 'violates unique constraint "entries_pkey"' };
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: null, error: dupError })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const result = await executeMutation(supabase, makeLogger(), makeMutation());
      expect(result).toEqual({});
    });

    it('throws when the insert returns an unrelated error', async () => {
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() =>
              Promise.resolve({ data: null, error: { code: '42501', message: 'RLS denied' } })
            ),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await expect(executeMutation(supabase, makeLogger(), makeMutation())).rejects.toMatchObject({
        code: '42501',
      });
    });

    it('throws an explanatory error when insert affects 0 rows (RLS silent block)', async () => {
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await expect(executeMutation(supabase, makeLogger(), makeMutation())).rejects.toThrow(
        /RLS policy blocked INSERT/
      );
    });

    it('routes through RPC and returns a remapped row id when the server assigns a new id', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() => Promise.resolve({ data: 'server-generated-id', error: null })),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        rowId: 'local-temp-id',
        rpc: { name: 'create_dog_with_registrations', expectRowId: true },
      });

      const result = await executeMutation(supabase, makeLogger(), mutation);
      expect(result).toEqual({ remappedRowId: 'server-generated-id' });
      expect(vi.mocked(supabase.from)).not.toHaveBeenCalled();
    });

    it('does not remap when the RPC-returned id matches the local row id', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() => Promise.resolve({ data: 'entry-1', error: null })),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        rowId: 'entry-1',
        rpc: { name: 'create_dog_with_registrations', expectRowId: true },
      });

      const result = await executeMutation(supabase, makeLogger(), mutation);
      expect(result).toEqual({});
    });
  });

  describe('UPDATE', () => {
    it('applies an OCC precondition and returns the new server version', async () => {
      const updateChain = chainable({ data: [{ id: 'entry-1', version: 5 }], error: null });
      const supabase = {
        from: vi.fn(() => ({ update: vi.fn(() => updateChain) })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        operation: 'UPDATE',
        serverVersion: 4,
        data: { id: 'entry-1', name: 'Updated' },
      });

      const result = await executeMutation(supabase, makeLogger(), mutation);
      expect(result).toEqual({ newServerVersion: 5 });
    });

    it('classifies a 0-row UPDATE result as an OCC rejection when the server version advanced', async () => {
      const updateChain = chainable({ data: [], error: null });
      const selectChain = chainable({ data: { version: 9 }, error: null });
      const supabase = {
        from: vi.fn(() => ({
          update: vi.fn(() => updateChain),
          select: vi.fn(() => selectChain),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        operation: 'UPDATE',
        serverVersion: 4,
        data: { id: 'entry-1', name: 'Updated' },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toBeInstanceOf(
        OccRejectionError
      );
    });

    it('routes an UPDATE through RPC and surfaces the returned version', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() => Promise.resolve({ data: 7, error: null })),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        operation: 'UPDATE',
        serverVersion: 6,
        data: { id: 'entry-1' },
        rpc: { name: 'ringside_update_entry', fields: { qualification: 'Qualified' } },
      });

      const result = await executeMutation(supabase, makeLogger(), mutation);
      expect(result).toEqual({ newServerVersion: 7 });
      expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith(
        'ringside_update_entry',
        expect.objectContaining({ p_fields: { qualification: 'Qualified' }, p_expected_version: 6 })
      );
    });

    it('re-throws an RPC version-conflict as an OccRejectionError carrying the fresh server version', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: { code: '40001', message: 'Version conflict', details: '9' },
          })
        ),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        operation: 'UPDATE',
        serverVersion: 6,
        data: { id: 'entry-1' },
        rpc: { name: 'ringside_update_entry' },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toMatchObject({
        currentServerVersion: 9,
      });
    });
  });

  describe('DELETE', () => {
    it('returns {} on a successful delete', async () => {
      const supabase = {
        from: vi.fn(() => ({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: [{ id: 'entry-1' }], error: null })),
            })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const result = await executeMutation(
        supabase,
        makeLogger(),
        makeMutation({ operation: 'DELETE', data: { id: 'entry-1' } })
      );
      expect(result).toEqual({});
    });

    it('logs a warning (but does not throw) when a delete affects 0 rows', async () => {
      const logger = makeLogger();
      const supabase = {
        from: vi.fn(() => ({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const result = await executeMutation(
        supabase,
        logger,
        makeMutation({ operation: 'DELETE', data: { id: 'entry-1' } })
      );
      expect(result).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('affected 0 rows'));
    });

    it('throws when the delete returns an error', async () => {
      const supabase = {
        from: vi.fn(() => ({
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => Promise.resolve({ data: null, error: { message: 'boom' } })),
            })),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await expect(
        executeMutation(
          supabase,
          makeLogger(),
          makeMutation({ operation: 'DELETE', data: { id: 'entry-1' } })
        )
      ).rejects.toMatchObject({ message: 'boom' });
    });
  });

  it('throws for an unknown operation', async () => {
    const supabase = { from: vi.fn(), rpc: vi.fn() } as unknown as SupabaseClient;
    const mutation = makeMutation({ operation: 'UPSERT' as never });

    await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toThrow(
      'Unknown operation'
    );
  });
});
