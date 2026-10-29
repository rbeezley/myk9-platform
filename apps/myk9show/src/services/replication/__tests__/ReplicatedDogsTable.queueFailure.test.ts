/**
 * MYK9-1471: a dog write whose mutation cannot be queued leaves the row as it
 * was (data, dirty flag, server version, revision), whether it started clean or
 * already dirty, and Discard still reverts a refused edit on a table that opts in.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { replicatedDogsTable as table, type ReplicatedDog } from '../ReplicatedDogsTable';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from './registrationQueueHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let queue: RegistrationQueueHarness;

const OVERFLOW = new Error('Mutation queue overflow: 1000 pending');
const REFUSED = { data: null, error: { code: '42501', message: 'permission denied' } };

const DOG: ReplicatedDog = {
  id: 'dog-1',
  name: 'Maxie',
  callName: 'Maxie',
  breed: 'Border Collie',
  _version: 1,
  _lastModified: new Date(),
  _syncStatus: 'synced',
};

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  setDeviceOnline(false);
  await table.set(DOG.id, DOG, false, undefined, 3);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

/** The fields a write owns; reads only bump access bookkeeping. */
async function snapshot() {
  const row = await table.getReplicatedRow(DOG.id);
  return {
    data: row?.data,
    isDirty: row?.isDirty,
    syncStatus: row?.syncStatus,
    serverVersion: row?.serverVersion,
    version: row?.version,
    baseData: row?.baseData,
  };
}

describe('updateDog when the queue refuses the mutation', () => {
  it('leaves a clean row exactly as it was', async () => {
    const before = await snapshot();
    vi.spyOn(queue.manager, 'queueMutation').mockRejectedValueOnce(OVERFLOW);

    await expect(table.updateDog(DOG.id, { name: 'Changed' })).rejects.toThrow(/overflow/);

    expect(await snapshot()).toEqual(before);
    expect(before.isDirty).toBe(false);
    expect(await queue.pending()).toEqual([]);
  });

  it('leaves an already-dirty row exactly as it was, with its own mutation intact', async () => {
    await table.updateDog(DOG.id, { name: 'First edit' });
    const before = await snapshot();
    const pendingBefore = await queue.pending();
    vi.spyOn(queue.manager, 'queueMutation').mockRejectedValueOnce(OVERFLOW);

    await expect(table.updateDog(DOG.id, { name: 'Second edit' })).rejects.toThrow(/overflow/);

    expect(await snapshot()).toEqual(before);
    expect(before.isDirty).toBe(true);
    expect(await queue.pending()).toEqual(pendingBefore);
  });

  it('accepts the next write once the queue recovers', async () => {
    vi.spyOn(queue.manager, 'queueMutation').mockRejectedValueOnce(OVERFLOW);
    await expect(table.updateDog(DOG.id, { name: 'Lost' })).rejects.toThrow(/overflow/);

    await table.updateDog(DOG.id, { name: 'Saved' });

    expect((await snapshot()).data?.name).toBe('Saved');
    expect(await queue.pending()).toHaveLength(1);
  });
});

describe('Discard of a refused dog edit', () => {
  it('still puts the row back to its last server state', async () => {
    const mutationId = await table.updateDog(DOG.id, { name: 'Refused edit' });
    setDeviceOnline(true);
    queue.answer.update = REFUSED;
    await queue.upload();
    await vi.waitFor(async () => expect(await queue.failed()).toHaveLength(1));

    await queue.manager.discardFailedMutation(mutationId!);

    const row = await snapshot();
    expect(row.data?.name).toBe('Maxie');
    expect(row.isDirty).toBe(false);
    expect(row.serverVersion).toBe(3);
  });
});
