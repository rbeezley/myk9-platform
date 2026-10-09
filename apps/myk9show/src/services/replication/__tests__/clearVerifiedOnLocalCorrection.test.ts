/**
 * MYK9-1031: a local score correction retracts the paper check on its class at once, whichever
 * path wrote it, as a clean local write (nothing queued, no write lock). A result a sync
 * downloaded is the server's business, and an unrelated local write moves nothing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@myk9/core', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn() },
}));

import { databaseManager } from '@myk9/replication';
import { startClearVerifiedOnLocalCorrection } from '../clearVerifiedOnLocalCorrection';
import { replicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';

const AT = '2026-10-10T15:00:00.000Z';
let stop: (() => void) | undefined;

const checkedClass = (id: string) =>
  ({
    id,
    trialId: 'trial-1',
    name: id,
    resultsVerifiedAt: AT,
    resultsVerifiedBy: 'auth-1',
    _version: 1,
    _lastModified: new Date(),
    _syncStatus: 'synced',
  }) as never;

const scoredEntry = (id: string, classId: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    showId: 'show-1',
    classId,
    isScored: true,
    resultStatus: 'qualified',
    finalPlacement: '1',
    searchTimeSeconds: 45.2,
    ...extra,
  }) as never;

const settle = () => new Promise(resolve => setTimeout(resolve, 120));
const checkOf = async (classId: string) =>
  (await replicatedClassesTable.getClassById(classId))?.resultsVerifiedAt ?? null;

beforeEach(async () => {
  await databaseManager.reset();
  await replicatedClassesTable.clearCache();
  await replicatedEntriesTable.clearCache();
  await replicatedClassesTable.batchSet([checkedClass('c1'), checkedClass('c2')]);
  await replicatedEntriesTable.batchSet([scoredEntry('e1', 'c1'), scoredEntry('e2', 'c2')]);
  stop = startClearVerifiedOnLocalCorrection();
  await settle(); // seeds the remembered lines
});

afterEach(() => {
  stop?.();
});

describe('clearVerifiedOnLocalCorrection', () => {
  it('a local correction clears the check on that class only, whichever path wrote it', async () => {
    await replicatedEntriesTable.updateEntry('e1', { resultStatus: 'nq' } as never);
    await settle();

    expect(await checkOf('c1')).toBeNull();
    expect(await checkOf('c2')).toBe(AT);
  });

  it('stays cleared when the upload is acknowledged', async () => {
    await replicatedEntriesTable.updateEntry('e1', { resultStatus: 'nq' } as never);
    await settle();
    await replicatedEntriesTable.markAsSynced('e1');
    await settle();

    expect(await checkOf('c1')).toBeNull();
  });

  it('leaves the check alone for a local write that changes no result', async () => {
    await replicatedEntriesTable.updateEntry('e1', { armband: '204' } as never);
    await settle();

    expect(await checkOf('c1')).toBe(AT);
  });

  it('leaves the check alone for a result a sync downloaded (the server clears its own)', async () => {
    await replicatedEntriesTable.set('e1', scoredEntry('e1', 'c1', { resultStatus: 'nq' }), false);
    await settle();

    expect(await checkOf('c1')).toBe(AT);
  });

  it('writes clean: the class row is not dirty and nothing is left pending', async () => {
    await replicatedEntriesTable.updateEntry('e1', { resultStatus: 'nq' } as never);
    await settle();

    const stored = await replicatedClassesTable.getReplicatedRow('c1');
    expect(stored?.isDirty).toBe(false);
  });
});
