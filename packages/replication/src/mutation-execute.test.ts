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

    it('treats a retried RPC INSERT unique violation as an already-applied mutation', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              code: '23505',
              message: 'duplicate key value violates unique constraint "dogs_pkey"',
            },
          })
        ),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        tableName: 'dogs',
        rowId: 'dog-1',
        data: { id: 'dog-1' },
        rpc: { name: 'create_dog_with_registrations', expectRowId: true },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).resolves.toEqual({});
    });

    it('does not swallow a duplicate registration constraint error', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: {
              code: '23505',
              message:
                'duplicate key value violates unique constraint "dog_registrations_live_org_number_unique"',
            },
          })
        ),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        tableName: 'dogs',
        rowId: 'dog-1',
        rpc: { name: 'create_dog_with_registrations', expectRowId: true },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  describe('UPDATE', () => {
    // MYK9-1132: the paperwork void payload carried no `id`, so the UPDATE went out as
    // id=eq.undefined and Postgres refused every attempt (22P02). The queued row id is the
    // row the local write targeted; the executor filters on it, not on the payload.
    it('filters on the queued row id even when the payload carries no id', async () => {
      const updateChain = chainable({ data: [{ id: 'print-1', version: 2 }], error: null });
      const supabase = {
        from: vi.fn(() => ({ update: vi.fn(() => updateChain) })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const mutation = makeMutation({
        tableName: 'paperwork_prints',
        operation: 'UPDATE',
        rowId: 'print-1',
        serverVersion: 1,
        data: {
          voided_at: '2026-10-12T19:59:00Z',
          voided_by: 'user-1',
          void_reason: 'Wrong class',
        },
      });

      await executeMutation(supabase, makeLogger(), mutation);
      expect(updateChain.eq).toHaveBeenCalledWith('id', 'print-1');
      expect(updateChain.eq).toHaveBeenCalledWith('version', 1);
    });

    it('re-checks a 0-row UPDATE against the queued row id when the payload carries no id', async () => {
      const updateChain = chainable({ data: [], error: null });
      const checkChain = chainable({ data: { version: 1 }, error: null });
      const from = vi
        .fn()
        .mockReturnValueOnce({ update: vi.fn(() => updateChain) })
        .mockReturnValueOnce({ select: vi.fn(() => checkChain) });
      const supabase = { from, rpc: vi.fn() } as unknown as SupabaseClient;
      const mutation = makeMutation({
        tableName: 'paperwork_prints',
        operation: 'UPDATE',
        rowId: 'print-1',
        serverVersion: 1,
        data: { void_reason: 'Wrong class' },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toThrow(
        'RLS policy blocked UPDATE on paperwork_prints for row print-1'
      );
      expect(checkChain.eq).toHaveBeenCalledWith('id', 'print-1');
    });

    it('omits a stale deleted_at null from an older queued entry update', async () => {
      const updateChain = chainable({ data: [{ id: 'entry-1', version: 5 }], error: null });
      const update = vi.fn(() => updateChain);
      const supabase = {
        from: vi.fn(() => ({ update })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;
      const mutation = makeMutation({
        operation: 'UPDATE',
        data: { id: 'entry-1', deleted_at: null, entry_status: 'confirmed' },
      });

      await executeMutation(supabase, makeLogger(), mutation);
      expect(update).toHaveBeenCalledWith({ id: 'entry-1', entry_status: 'confirmed' });
    });

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

    it("passes the row id under the RPC's own id parameter when one is named", async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() => Promise.resolve({ data: 4, error: null })),
      } as unknown as SupabaseClient;

      // The queue names the class as the mutation's row; the RPC argument comes from it,
      // not from a payload `id` (MYK9-1132).
      const mutation = makeMutation({
        operation: 'UPDATE',
        rowId: 'class-1',
        serverVersion: 3,
        data: {},
        rpc: {
          name: 'ringside_update_class',
          fields: { status: 'in_progress' },
          idParam: 'p_class_id',
        },
      });

      expect(await executeMutation(supabase, makeLogger(), mutation)).toEqual({
        newServerVersion: 4,
      });
      expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('ringside_update_class', {
        p_class_id: 'class-1',
        p_fields: { status: 'in_progress' },
        p_expected_version: 3,
      });
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

    it('does not treat a unique violation from an RPC UPDATE as success', async () => {
      const supabase = {
        from: vi.fn(),
        rpc: vi.fn(() =>
          Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          })
        ),
      } as unknown as SupabaseClient;

      const mutation = makeMutation({
        operation: 'UPDATE',
        data: { id: 'entry-1' },
        rpc: { name: 'ringside_update_entry' },
      });

      await expect(executeMutation(supabase, makeLogger(), mutation)).rejects.toMatchObject({
        code: '23505',
      });
    });
  });

  describe('DELETE', () => {
    it('filters on the queued row id even when the payload carries no id', async () => {
      const eq = vi.fn(() => ({
        select: vi.fn(() => Promise.resolve({ data: [{ id: 'entry-1' }], error: null })),
      }));
      const supabase = {
        from: vi.fn(() => ({ delete: vi.fn(() => ({ eq })) })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await executeMutation(
        supabase,
        makeLogger(),
        makeMutation({ operation: 'DELETE', rowId: 'entry-1', data: {} })
      );
      expect(eq).toHaveBeenCalledWith('id', 'entry-1');
    });

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

  // MYK9-1488: postgrest reports the HTTP status beside `error`; the retry policy needs it on the thrown error.
  describe('HTTP status of a failed write', () => {
    const gatewayError = () => ({
      message: 'upstream unavailable',
      code: '',
      details: '',
      hint: '',
    });
    const settled = (status: number) =>
      Promise.resolve({ data: null, error: gatewayError(), status });
    const chain = (status: number) => {
      const node: Record<string, unknown> = {};
      node.eq = vi.fn(() => node);
      node.select = vi.fn(() => settled(status));
      return node;
    };

    it.each([
      ['INSERT', 'insert', { insert: (status: number) => ({ select: () => settled(status) }) }],
      ['UPDATE', 'update', { update: (status: number) => chain(status) }],
      ['DELETE', 'delete', { delete: (status: number) => chain(status) }],
    ] as const)('carries the status on a failed %s', async (operation, _key, builder) => {
      const [method, make] = Object.entries(builder)[0] as [string, (status: number) => unknown];
      const supabase = {
        from: vi.fn(() => ({ [method]: vi.fn(() => make(503)) })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      await expect(
        executeMutation(
          supabase,
          makeLogger(),
          makeMutation({ operation, data: { id: 'entry-1' } })
        )
      ).rejects.toMatchObject({ message: 'upstream unavailable', httpStatus: 503 });
    });

    it.each(['INSERT', 'UPDATE'] as const)(
      'carries the status on a failed %s rpc',
      async operation => {
        const supabase = {
          from: vi.fn(),
          rpc: vi.fn(() => settled(504)),
        } as unknown as SupabaseClient;

        await expect(
          executeMutation(
            supabase,
            makeLogger(),
            makeMutation({ operation, rpc: { name: 'ringside_update_entry', args: {} } })
          )
        ).rejects.toMatchObject({ httpStatus: 504 });
      }
    );

    it('leaves a status-less transport failure without an httpStatus', async () => {
      const supabase = {
        from: vi.fn(() => ({
          insert: vi.fn(() => ({
            select: () => Promise.resolve({ data: null, error: gatewayError(), status: 0 }),
          })),
        })),
        rpc: vi.fn(),
      } as unknown as SupabaseClient;

      const thrown = await executeMutation(supabase, makeLogger(), makeMutation()).catch(e => e);
      expect(thrown).not.toHaveProperty('httpStatus');
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
