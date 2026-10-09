/**
 * MYK9-1031: "scores match the paper" on the class replica.
 *
 * Value-sensitive: the check reaches the server only through the RPC named in the queued
 * mutation, with the class id, the fingerprint of the results that were checked and the moment it
 * was pressed. A wrong RPC name or argument name fails on sync, long after the secretary saw
 * "checked" (an unknown argument is a 404 PGRST202), so these pin the exact call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@/types/supabase';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import {
  ReplicatedClassesTable,
  rowToClass,
  type ReplicatedClass,
} from '../ReplicatedClassesTable';
import { REPLICATION_STORES } from '@myk9/replication';

type QueueMutation = (
  operation: string,
  rowId: string,
  payload: Record<string, unknown>,
  dependsOn?: string[],
  rpc?: { name: string; args?: Record<string, unknown> }
) => Promise<string | null>;

const AT = '2026-10-10T21:15:00.000Z';
const FP = 'a'.repeat(64);

function baseClass(overrides: Partial<ReplicatedClass> = {}): ReplicatedClass {
  return {
    id: 'class-1',
    trialId: 'trial-1',
    name: 'Container Novice A',
    classStatus: 'completed',
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
    ...overrides,
  };
}

describe('ReplicatedClassesTable results verified (MYK9-1031)', () => {
  let table: ReplicatedClassesTable;
  let queueMutation: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    table = new ReplicatedClassesTable();
    const resettable = table as unknown as {
      runTransaction: (
        storeName: string,
        mode: IDBTransactionMode,
        callback: (store: { clear?: () => Promise<void> }) => Promise<void>
      ) => Promise<void>;
    };
    for (const storeName of [
      REPLICATION_STORES.REPLICATED_TABLES,
      REPLICATION_STORES.SYNC_METADATA,
    ]) {
      await resettable.runTransaction(storeName, 'readwrite', async store => {
        await store.clear?.();
      });
    }
    queueMutation = vi.spyOn(table as unknown as { queueMutation: QueueMutation }, 'queueMutation');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queues the check through mark_class_results_verified with the exact argument names', async () => {
    await table.set('class-1', baseClass());

    await table.setResultsVerified('class-1', { at: AT, by: 'auth-secretary', fingerprint: FP });

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'class-1',
      { id: 'class-1', results_verified_at: AT },
      undefined,
      {
        name: 'mark_class_results_verified',
        args: { p_class_id: 'class-1', p_results_fingerprint: FP, p_verified_at: AT },
      }
    );
    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: AT,
      resultsVerifiedBy: 'auth-secretary',
      resultsVerifiedFingerprint: FP,
      _syncStatus: 'pending',
    });
  });

  it('keeps the first stamp when the same results are checked again, as the server does', async () => {
    await table.set(
      'class-1',
      baseClass({
        resultsVerifiedAt: '2026-10-10T20:00:00.000Z',
        resultsVerifiedBy: 'auth-first',
        resultsVerifiedFingerprint: FP,
      })
    );

    await table.setResultsVerified('class-1', { at: AT, by: 'auth-second', fingerprint: FP });

    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: '2026-10-10T20:00:00.000Z',
      resultsVerifiedBy: 'auth-first',
    });
    expect(queueMutation.mock.calls.at(-1)?.[4]).toMatchObject({
      args: { p_verified_at: '2026-10-10T20:00:00.000Z' },
    });
  });

  it('takes a new stamp when the results changed since the old check', async () => {
    await table.set(
      'class-1',
      baseClass({
        resultsVerifiedAt: '2026-10-10T20:00:00.000Z',
        resultsVerifiedBy: 'auth-first',
        resultsVerifiedFingerprint: 'b'.repeat(64),
      })
    );

    await table.setResultsVerified('class-1', { at: AT, by: 'auth-second', fingerprint: FP });

    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: AT,
      resultsVerifiedBy: 'auth-second',
      resultsVerifiedFingerprint: FP,
    });
  });

  it('puts the row back when the queue refuses the write, so Release does not unlock', async () => {
    await table.set('class-1', baseClass());
    queueMutation.mockRejectedValueOnce(new Error('queue full'));

    await expect(
      table.setResultsVerified('class-1', { at: AT, by: 'auth-secretary', fingerprint: FP })
    ).rejects.toThrow('queue full');

    const row = await table.getClassById('class-1');
    expect(row?.resultsVerifiedAt ?? null).toBeNull();
    expect(row?.resultsVerifiedFingerprint ?? null).toBeNull();
    expect((await table.getReplicatedRow('class-1'))?.isDirty).toBe(false);
  });

  it('stores a baseline for a check made elsewhere, once, locally, with nothing queued', async () => {
    await table.set('class-1', baseClass({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-x' }));

    await expect(table.rememberResultsBaseline('class-1', AT, FP)).resolves.toBe(true);
    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedFingerprint: FP });
    expect(queueMutation).not.toHaveBeenCalled();
    // A second sight never overwrites the first baseline.
    await expect(table.rememberResultsBaseline('class-1', AT, 'c'.repeat(64))).resolves.toBe(false);
    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedFingerprint: FP });
  });

  it('stores no baseline for a stamp that has since changed', async () => {
    await table.set('class-1', baseClass({ resultsVerifiedAt: AT }));
    await expect(
      table.rememberResultsBaseline('class-1', '2026-10-11T08:00:00.000Z', FP)
    ).resolves.toBe(false);
  });

  it('queues the undo through clear_class_results_verified', async () => {
    await table.set(
      'class-1',
      baseClass({
        resultsVerifiedAt: AT,
        resultsVerifiedBy: 'auth-x',
        resultsVerifiedFingerprint: FP,
      })
    );

    await table.setResultsVerified('class-1', null);

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'class-1',
      { id: 'class-1', results_verified_at: null },
      undefined,
      { name: 'clear_class_results_verified', args: { p_class_id: 'class-1' } }
    );
    expect(await table.getClassById('class-1')).toMatchObject({
      resultsVerifiedAt: null,
      resultsVerifiedBy: null,
      resultsVerifiedFingerprint: null,
    });
  });

  it('never writes the check on an unrelated class edit', async () => {
    await table.set('class-1', baseClass({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-x' }));

    await table.updateClass('class-1', { name: 'Container Novice B' });

    const payload = queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('results_verified_at');
    expect(payload).not.toHaveProperty('results_verified_by');
    expect(payload).not.toHaveProperty('results_verified_fingerprint');
    expect(await table.getClassById('class-1')).toMatchObject({ resultsVerifiedAt: AT });
  });

  it('reads the check off the class row (and never invents a fingerprint)', () => {
    const row = {
      id: 'class-1',
      trial_id: 'trial-1',
      name: 'Container Novice A',
      results_verified_at: AT,
      results_verified_by: 'auth-secretary',
    } as Database['public']['Tables']['classes']['Row'];

    const mapped = rowToClass(row);
    expect(mapped).toMatchObject({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-secretary' });
    expect(mapped.resultsVerifiedFingerprint).toBeUndefined();
  });

  describe('merging the server row', () => {
    const merge = (local: ReplicatedClass, remote: ReplicatedClass) =>
      (
        table as unknown as {
          resolveConflict: (l: ReplicatedClass, r: ReplicatedClass) => ReplicatedClass;
        }
      ).resolveConflict(local, remote);

    it('keeps the local fingerprint while the server echoes back the stamp this device sent', () => {
      const merged = merge(
        baseClass({ resultsVerifiedAt: AT, resultsVerifiedFingerprint: FP }),
        baseClass({ resultsVerifiedAt: '2026-10-10T21:15:00+00:00', resultsVerifiedBy: 'auth-1' })
      );
      expect(merged).toMatchObject({
        resultsVerifiedAt: '2026-10-10T21:15:00+00:00',
        resultsVerifiedFingerprint: FP,
      });
    });

    it('drops it when the server cleared the check or holds a different stamp', () => {
      const local = baseClass({ resultsVerifiedAt: AT, resultsVerifiedFingerprint: FP });
      expect(merge(local, baseClass({ resultsVerifiedAt: null })).resultsVerifiedFingerprint).toBe(
        undefined
      );
      expect(
        merge(local, baseClass({ resultsVerifiedAt: '2026-10-11T08:00:00.000Z' }))
          .resultsVerifiedFingerprint
      ).toBe(undefined);
    });
  });
});
