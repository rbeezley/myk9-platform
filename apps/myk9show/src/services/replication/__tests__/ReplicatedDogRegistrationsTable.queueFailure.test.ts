/**
 * Queued registration writes that cannot be queued, or that race a refused
 * INSERT (MYK9-1140, deferred from MYK9-1090 PR 3a):
 *
 * 1. When the queue refuses a write (the 1,000-mutation overflow), the local
 *    row is put back: a registration is never left hidden with no DELETE
 *    queued, and an add is never left as a device-only row with no INSERT.
 * 2. A DELETE waits for a refused (failed) INSERT of the same row, so a
 *    later Retry of that INSERT can never re-create a confirmed delete.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { unsentWorkProvenByServer } from '@/services/database/registrations/unsentWork';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { serverRow } from './dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from './registrationQueueHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let queue: RegistrationQueueHarness;

const REFUSED = { data: null, error: { code: '42501', message: 'permission denied' } };
const OVERFLOW = new Error('Mutation queue overflow: 1000 pending');

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  setDeviceOnline(false);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

const DRAFT = {
  dog_id: 'dog-1',
  organization: 'AKC',
  registration_number: 'Q1',
  registered_name: 'Queued',
};

function queueRefuses(): void {
  vi.spyOn(queue.manager, 'prepareMutation').mockRejectedValueOnce(OVERFLOW);
}

describe('a write the queue refuses is rolled back', () => {
  it('an add leaves no device-only row behind', async () => {
    queueRefuses();

    await expect(table.addRegistration(DRAFT)).rejects.toThrow(/overflow/);

    expect(await table.getAllOrThrow()).toEqual([]);
    expect(await table.getUnsentWorkForDogs(['dog-1'])).toEqual([]);
    expect(await queue.pending()).toEqual([]);
  });

  it('a delete leaves the registration visible and clean, and a retry queues the DELETE', async () => {
    await table.applyServerRows([serverRow({ id: 'reg-1', dog_id: 'dog-1', version: 3 })]);
    queueRefuses();

    await expect(table.deleteRegistration('reg-1')).rejects.toThrow(/overflow/);

    const row = await table.getReplicatedRow('reg-1');
    expect(row?.isDirty).toBe(false);
    expect(row?.serverVersion).toBe(3);
    expect(row?.data._pendingDelete).toBeUndefined();
    expect(await table.getRegistrationsForDogs(['dog-1'])).toHaveLength(1);
    expect(await queue.pending()).toEqual([]);

    await table.deleteRegistration('reg-1');

    expect(await queue.pending()).toMatchObject([{ operation: 'DELETE', rowId: 'reg-1' }]);
    expect(await table.getRegistrationsForDogs(['dog-1'])).toEqual([]);
  });
});

describe('a DELETE waits for a refused INSERT of the same row', () => {
  /** An add whose INSERT landed (lost ack) and whose replay was then refused. */
  async function addWithRefusedInsert() {
    const added = await table.addRegistration(DRAFT);
    await unsentWorkProvenByServer(
      ['dog-1'],
      [
        serverRow({
          id: added.id,
          dog_id: 'dog-1',
          organization: 'AKC',
          registration_number: 'Q1',
          registered_name: 'Queued',
          version: 1,
        }),
      ]
    );
    setDeviceOnline(true);
    queue.answer.insert = REFUSED;
    await queue.upload();
    const [failed] = await queue.failed();
    expect(failed).toMatchObject({ operation: 'INSERT', rowId: added.id });
    setDeviceOnline(false);
    return { added, failed: failed! };
  }

  it('names the failed INSERT as a dependency and does not upload ahead of it', async () => {
    const { added, failed } = await addWithRefusedInsert();

    await table.deleteRegistration(added.id);
    const deletion = (await queue.pending()).find(m => m.operation === 'DELETE');
    expect(deletion?.dependsOn).toContain(failed.id);

    setDeviceOnline(true);
    queue.answer.insert = undefined;
    await queue.upload();

    expect(queue.sent.filter(([operation]) => operation === 'delete')).toEqual([]);
    expect((await queue.pending()).map(m => m.operation)).toEqual(['DELETE']);
  });

  it('a Retry of the INSERT lands before the DELETE, so the delete is never undone', async () => {
    const { added, failed } = await addWithRefusedInsert();
    await table.deleteRegistration(added.id);
    setDeviceOnline(true);
    queue.answer.insert = undefined;
    const sentBefore = queue.sent.length;

    await queue.manager.retryFailedMutation(failed.id);
    await queue.upload();

    expect(queue.sent.slice(sentBefore).map(([operation]) => operation)).toEqual([
      'insert',
      'delete',
    ]);
    expect(queue.server.has(added.id)).toBe(false);
    expect(await queue.failed()).toEqual([]);
  });

  it.each([
    ['registration', 'dog_registrations', 'reg-1'],
    ['dog', 'dogs', 'dog-1'],
  ])(
    'a refused %s UPDATE is not a dependency: the DELETE still uploads',
    async (_label, tableName, rowId) => {
      await table.applyServerRows([serverRow({ id: 'reg-1', dog_id: 'dog-1', version: 2 })]);
      await queue.manager.queueMutation(tableName, 'UPDATE', rowId, { id: rowId }, undefined, 1);
      setDeviceOnline(true);
      queue.answer.update = REFUSED;
      await queue.upload();
      expect(await queue.failed()).toMatchObject([{ operation: 'UPDATE', rowId }]);
      setDeviceOnline(false);
      queue.answer.update = undefined;

      await table.deleteRegistration('reg-1');
      const deletion = (await queue.pending()).find(m => m.operation === 'DELETE');
      expect(deletion?.dependsOn ?? []).toEqual([]);

      setDeviceOnline(true);
      await queue.upload();

      expect(queue.sent.filter(([operation]) => operation === 'delete')).toHaveLength(1);
      expect((await queue.pending()).filter(m => m.operation === 'DELETE')).toEqual([]);
      expect(await table.getRegistrationsForDogs(['dog-1'])).toEqual([]);
    }
  );

  it.each([
    ['registration', 'dog_registrations', 'reg-1'],
    ['dog', 'dogs', 'dog-1'],
  ])(
    'a pending %s UPDATE ahead of the DELETE never strands it, even once the UPDATE is refused',
    async (_label, tableName, rowId) => {
      await table.applyServerRows([serverRow({ id: 'reg-1', dog_id: 'dog-1', version: 2 })]);
      await queue.manager.queueMutation(tableName, 'UPDATE', rowId, { id: rowId }, undefined, 1);

      await table.deleteRegistration('reg-1');
      const pending = await queue.pending();
      const update = pending.find(m => m.operation === 'UPDATE');
      expect(pending.find(m => m.operation === 'DELETE')?.dependsOn ?? []).not.toContain(
        update!.id
      );

      setDeviceOnline(true);
      queue.answer.update = REFUSED;
      await queue.upload();

      expect(queue.sent.filter(([operation]) => operation === 'delete')).toHaveLength(1);
      expect((await queue.pending()).filter(m => m.operation === 'DELETE')).toEqual([]);
    }
  );
});

describe('deleting the same registration twice at once', () => {
  it('does not report success for a delete whose enqueue failed and was rolled back', async () => {
    await table.applyServerRows([serverRow({ id: 'reg-1', dog_id: 'dog-1', version: 2 })]);
    // The first enqueue fails late, so the second call arrives while the row is hidden.
    vi.spyOn(queue.manager, 'prepareMutation').mockImplementationOnce(async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      throw OVERFLOW;
    });

    const firstCall = table.deleteRegistration('reg-1');
    await new Promise(resolve => setTimeout(resolve, 20));
    const [first, second] = await Promise.allSettled([
      firstCall,
      table.deleteRegistration('reg-1'),
    ]);

    expect(first.status).toBe('rejected');
    // The second call either queued the DELETE or rejected: never a silent success.
    const queued = (await queue.pending()).some(m => m.operation === 'DELETE');
    expect(second.status === 'rejected' || queued).toBe(true);
    expect(queued).toBe(second.status === 'fulfilled');
  });
});
