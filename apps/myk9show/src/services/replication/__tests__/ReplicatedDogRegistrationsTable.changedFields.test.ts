/**
 * Codex final round on PR 3a (MYK9-1090):
 *
 * - A registration edit uploads only the columns the user changed, and the
 *   device write applies only those onto the row as it is when written. A
 *   name-only edit therefore never reverts another device's breed change,
 *   whether the device learned the newer token from a server read after a
 *   lost acknowledgement, or from a download that landed mid-edit.
 * - A no-op edit queues nothing.
 * - A re-add of a registration whose old row's DELETE is still queued waits
 *   for that DELETE, or the live org/number unique index refuses it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { unsentWorkProvenByServer } from '@/services/database/registrations/unsentWork';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { installRegistrationsServer, newServer, serverRow } from './dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from './registrationQueueHarness';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let queue: RegistrationQueueHarness;

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  setDeviceOnline(false);
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

const updatesSent = () => queue.sent.filter(([op]) => op === 'update').map(([, , p]) => p);

describe('a name-only edit never reverts a server change to another field', () => {
  it('after a lost acknowledgement, when a server read proved the add landed', async () => {
    const added = await table.addRegistration({
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'X1',
      registered_name: 'Old Name',
      breed: 'Beagle',
    });
    // The INSERT committed (ack lost), then another device changed the breed.
    const onServer = serverRow({
      id: added.id,
      registration_number: 'X1',
      registered_name: 'Old Name',
      breed: 'Basset Hound',
      version: 2,
    });
    queue.server.set(added.id, { ...onServer });
    installRegistrationsServer(newServer({ rows: [onServer] }));
    await unsentWorkProvenByServer(['dog-1'], [onServer]);
    // The read proves the add landed; it does not move the token ahead of
    // the device's data (that comes with a download).
    expect((await table.getReplicatedRow(added.id))?.serverVersion).toBe(1);

    await table.updateRegistration(added.id, { registered_name: 'New Name' });
    setDeviceOnline(true);
    await queue.upload();

    expect(updatesSent().every(p => !('breed' in (p as object)))).toBe(true);
    expect(queue.server.get(added.id)).toMatchObject({ breed: 'Basset Hound' });
  });

  it('when a download lands while the edit is being written', async () => {
    await table.applyServerRows([
      serverRow({ id: 'reg-1', registered_name: 'Old Name', breed: 'Beagle', version: 3 }),
    ]);
    const newer = serverRow({
      id: 'reg-1',
      registered_name: 'Old Name',
      breed: 'Basset Hound',
      version: 4,
    });
    queue.server.set('reg-1', { ...newer });
    // The download lands after the edit read the row, before it wrote it.
    const read = table.getPendingMutationIdsForRow.bind(table);
    vi.spyOn(table, 'getPendingMutationIdsForRow').mockImplementationOnce(async id => {
      await table.applyServerRows([newer]);
      return read(id);
    });

    await table.updateRegistration('reg-1', { registered_name: 'New Name' });

    expect(await table.get('reg-1')).toMatchObject({
      registeredName: 'New Name',
      breed: 'Basset Hound',
    });
    setDeviceOnline(true);
    await queue.upload();
    expect(updatesSent().every(p => !('breed' in (p as object)))).toBe(true);
    expect(queue.server.get('reg-1')).toMatchObject({
      registered_name: 'New Name',
      breed: 'Basset Hound',
    });
  });

  it('uploads only the changed columns and updated_at, with the OCC token', async () => {
    await table.applyServerRows([
      serverRow({ id: 'reg-1', registered_name: 'Old Name', breed: 'Beagle', version: 3 }),
    ]);

    await table.updateRegistration('reg-1', {
      organization: 'AKC',
      registered_name: 'New Name',
      breed: 'Beagle',
      registration_number: 'SR12345601',
    });

    const [update] = await queue.pending();
    expect(update).toMatchObject({ operation: 'UPDATE', serverVersion: 3 });
    expect(Object.keys(update!.data).sort()).toEqual(['registered_name', 'updated_at']);
  });

  it('a no-op edit queues nothing', async () => {
    await table.applyServerRows([
      serverRow({ id: 'reg-1', registered_name: 'Same', breed: 'Beagle', version: 3 }),
    ]);

    await table.updateRegistration('reg-1', { registered_name: 'Same', breed: 'Beagle' });

    expect(await queue.pending()).toEqual([]);
    expect((await table.getReplicatedRow('reg-1'))?.isDirty).toBe(false);
  });
});

describe('re-adding a registration whose old row is being deleted', () => {
  it('the INSERT waits for the queued DELETE of the same organization and number', async () => {
    await table.applyServerRows([
      serverRow({ id: 'reg-old', organization: 'AKC', registration_number: 'SR 123' }),
    ]);
    await table.deleteRegistration('reg-old');
    const deletion = (await queue.pending()).find(m => m.operation === 'DELETE');

    const readded = await table.addRegistration({
      dog_id: 'dog-1',
      organization: 'akc',
      registration_number: 'SR123',
    });

    const insert = (await queue.pending()).find(m => m.rowId === readded.id);
    expect(insert?.dependsOn).toContain(deletion!.id);
  });
});
