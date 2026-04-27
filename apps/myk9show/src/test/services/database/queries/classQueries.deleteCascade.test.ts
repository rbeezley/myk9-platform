/**
 * deleteClass cascade tests.
 *
 * Verifies that `deleteClass` delegates to the `soft_delete_class` RPC
 * (migration 165). The RPC mirrors `soft_delete_show` (migration 037) and
 * handles the class + entries cascade atomically server-side, so the test
 * surface here is "did we call the right function with the right args and
 * propagate the right errors".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface RpcCall {
  fn: string;
  args: Record<string, unknown>;
}

const { mockSupabase, recorded } = vi.hoisted(() => {
  const calls: RpcCall[] = [];
  type RpcResponse = { data: unknown; error: unknown };
  const responses: RpcResponse[] = [];

  return {
    recorded: { calls, responses },
    mockSupabase: {
      rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return responses.shift() ?? { data: null, error: null };
      }),
    },
  };
});

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
  logQuery: vi.fn(),
  createDatabaseError: vi.fn((err: unknown) =>
    err instanceof Error ? err : new Error(String(err))
  ),
  DatabaseError: class DatabaseError extends Error {},
}));

vi.mock('@/services/replication/ReplicatedClassesTable', () => ({
  replicatedClassesTable: { getAll: vi.fn(), getClassById: vi.fn(), getClassesByTrial: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getAll: vi.fn(), getEntriesByClass: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: { getAll: vi.fn(), getTrialById: vi.fn() },
}));
vi.mock('@/services/replication/ReplicatedDogsTable', () => ({
  replicatedDogsTable: { getAll: vi.fn() },
}));

vi.mock('@/services/LoggingService', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { deleteClass } from '@/services/database/queries/classQueries';

describe('deleteClass cascade behavior', () => {
  beforeEach(() => {
    recorded.calls.length = 0;
    recorded.responses.length = 0;
    vi.clearAllMocks();
  });

  it('delegates to the soft_delete_class RPC with the class id', async () => {
    await deleteClass('class-1');

    expect(recorded.calls).toHaveLength(1);
    expect(recorded.calls[0].fn).toBe('soft_delete_class');
    expect(recorded.calls[0].args).toEqual({ p_class_id: 'class-1' });
  });

  it('returns success with the class id on the happy path', async () => {
    const result = await deleteClass('class-1');

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'class-1', name: null });
  });

  it('propagates RPC errors with no fallback writes', async () => {
    recorded.responses.push({ data: null, error: { message: 'rls denied', code: '42501' } });

    const result = await deleteClass('class-1');

    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
    // Only one call: no two-step retry, no app-layer cascade.
    expect(recorded.calls).toHaveLength(1);
  });

  it('ignores the legacy deletedBy parameter (RPC reads auth.uid server-side)', async () => {
    await deleteClass('class-1', 'user-7');

    expect(recorded.calls[0].args).toEqual({ p_class_id: 'class-1' });
    expect(recorded.calls[0].args).not.toHaveProperty('deleted_by');
  });
});
