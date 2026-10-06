/**
 * MYK9-1030: the judge's end-of-day sign-off on the class replica.
 *
 * Value-sensitive: the sign-off reaches the server only through the RPC named in the queued
 * mutation, with the class id and the moment it was pressed. A wrong RPC name or argument shape
 * fails on sync, long after the secretary saw "recorded", so these pin the exact call.
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

describe('ReplicatedClassesTable judge sign-off (MYK9-1030)', () => {
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

  it('queues the record through mark_classes_judge_signed_off with this one class', async () => {
    await table.set('class-1', baseClass());

    await table.setJudgeSignOff('class-1', { at: AT, by: 'auth-secretary' });

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'class-1',
      { id: 'class-1', judge_signed_off_at: AT },
      undefined,
      {
        name: 'mark_classes_judge_signed_off',
        args: { p_class_ids: ['class-1'], p_signed_off_at: AT },
      }
    );
    expect(await table.getClassById('class-1')).toMatchObject({
      judgeSignedOffAt: AT,
      judgeSignedOffBy: 'auth-secretary',
      _syncStatus: 'pending',
    });
  });

  it('keeps the first stamp when the class is already signed off, as the server does', async () => {
    await table.set(
      'class-1',
      baseClass({ judgeSignedOffAt: '2026-10-10T20:00:00.000Z', judgeSignedOffBy: 'auth-first' })
    );

    await table.setJudgeSignOff('class-1', { at: AT, by: 'auth-second' });

    expect(await table.getClassById('class-1')).toMatchObject({
      judgeSignedOffAt: '2026-10-10T20:00:00.000Z',
      judgeSignedOffBy: 'auth-first',
    });
  });

  it('queues the per-class undo through clear_class_judge_sign_off', async () => {
    await table.set('class-1', baseClass({ judgeSignedOffAt: AT, judgeSignedOffBy: 'auth-x' }));

    await table.setJudgeSignOff('class-1', null);

    expect(queueMutation).toHaveBeenCalledWith(
      'UPDATE',
      'class-1',
      { id: 'class-1', judge_signed_off_at: null },
      undefined,
      { name: 'clear_class_judge_sign_off', args: { p_class_id: 'class-1' } }
    );
    expect(await table.getClassById('class-1')).toMatchObject({
      judgeSignedOffAt: null,
      judgeSignedOffBy: null,
    });
  });

  it('never writes the sign-off columns on an unrelated class edit', async () => {
    await table.set('class-1', baseClass({ judgeSignedOffAt: AT, judgeSignedOffBy: 'auth-x' }));

    await table.updateClass('class-1', { name: 'Container Novice B' });

    const payload = queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('judge_signed_off_at');
    expect(payload).not.toHaveProperty('judge_signed_off_by');
    expect(await table.getClassById('class-1')).toMatchObject({ judgeSignedOffAt: AT });
  });

  it('reads the sign-off columns off the class row', () => {
    const row = {
      id: 'class-1',
      trial_id: 'trial-1',
      name: 'Container Novice A',
      judge_signed_off_at: AT,
      judge_signed_off_by: 'auth-secretary',
    } as Database['public']['Tables']['classes']['Row'];

    expect(rowToClass(row)).toMatchObject({
      judgeSignedOffAt: AT,
      judgeSignedOffBy: 'auth-secretary',
    });
  });

  describe('results checked against the paper score sheets', () => {
    it('queues the check through set_class_results_verified', async () => {
      await table.set('class-1', baseClass());

      await table.setResultsVerified('class-1', { at: AT, by: 'auth-secretary' });

      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'class-1',
        { id: 'class-1', results_verified_at: AT },
        undefined,
        {
          name: 'set_class_results_verified',
          args: { p_class_id: 'class-1', p_verified: true, p_verified_at: AT },
        }
      );
      expect(await table.getClassById('class-1')).toMatchObject({
        resultsVerifiedAt: AT,
        resultsVerifiedBy: 'auth-secretary',
      });
    });

    it('queues the clear with p_verified false', async () => {
      await table.set('class-1', baseClass({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-x' }));

      await table.setResultsVerified('class-1', null);

      expect(queueMutation).toHaveBeenCalledWith(
        'UPDATE',
        'class-1',
        { id: 'class-1', results_verified_at: null },
        undefined,
        {
          name: 'set_class_results_verified',
          args: { p_class_id: 'class-1', p_verified: false },
        }
      );
      expect(await table.getClassById('class-1')).toMatchObject({
        resultsVerifiedAt: null,
        resultsVerifiedBy: null,
      });
    });

    it('reads and never echoes the columns on an unrelated edit', async () => {
      expect(
        rowToClass({
          id: 'class-1',
          trial_id: 'trial-1',
          name: 'Container Novice A',
          results_verified_at: AT,
          results_verified_by: 'auth-secretary',
        } as Database['public']['Tables']['classes']['Row'])
      ).toMatchObject({ resultsVerifiedAt: AT, resultsVerifiedBy: 'auth-secretary' });

      await table.set('class-1', baseClass({ resultsVerifiedAt: AT }));
      await table.updateClass('class-1', { name: 'Container Novice B' });
      const payload = queueMutation.mock.calls.at(-1)?.[2] as Record<string, unknown>;
      expect(payload).not.toHaveProperty('results_verified_at');
      expect(payload).not.toHaveProperty('results_verified_by');
    });
  });
});
