/**
 * MYK9-1129: three races queued registration writes make live.
 *
 * a. An ID pass that read a registration just before this device's queued
 *    DELETE of it landed must not store it back after the delete is confirmed.
 * b. An ID pass must not remove a queued add whose INSERT is acknowledged
 *    while the id pages are in flight (the acknowledgement does not move the
 *    row's revision).
 * c. When the server merges an offline dog create onto an existing dog, it
 *    inserts none of the create's registrations: once one placeholder of that
 *    create resolves, its siblings are resolved too.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from '@myk9/replication';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { ReplicatedDogsTable } from '../ReplicatedDogsTable';
import { mergeUnsentWork } from '../dogRegistrationMerge';
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
  queue = createRegistrationQueueHarness();
  setDeviceOnline(true);
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  await databaseManager.reset();
});

describe('a. a confirmed delete is not stored back by an ID pass already reading', () => {
  it('drops the fetched row the delete was confirmed for mid-pass', async () => {
    const deleted = serverRow({ id: 'reg-del' });
    const server = newServer({ idPages: [[{ id: 'reg-del' }]], rows: [deleted] });
    installRegistrationsServer(server);
    // The id page says reg-del exists and the device lacks it, so the pass
    // fetches it by id. While that read is in flight, this device's queued
    // DELETE of it is confirmed.
    server.onIdLookup = async () => {
      await table.applyServerRows([deleted]);
      await table.deleteRegistration('reg-del');
      await queue.upload();
    };

    await table.reconcileWithServerIds();

    expect(await table.getReplicatedRow('reg-del')).toBeNull();
  });

  it('a pass that starts after the delete stores what the server shows', async () => {
    await table.confirmDeleted(['reg-back']);
    installRegistrationsServer(
      newServer({ idPages: [[{ id: 'reg-back' }]], rows: [serverRow({ id: 'reg-back' })] })
    );

    await table.reconcileWithServerIds();

    expect(await table.getReplicatedRow('reg-back')).not.toBeNull();
  });
});

describe('b. an acknowledged add survives the ID pass that was reading', () => {
  it('keeps a queued add whose INSERT uploads while the id pages are in flight', async () => {
    setDeviceOnline(false);
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'NEW1' });
    setDeviceOnline(true);
    const server = newServer({ idPages: [[]] });
    server.onIdPage = async () => {
      // The id set was read before the INSERT landed; the upload is acknowledged now.
      await queue.upload();
    };
    installRegistrationsServer(server);

    await table.reconcileWithServerIds();

    expect(queue.sent.map(([op]) => op)).toEqual(['insert']);
    expect(await table.getReplicatedRow(added.id)).toMatchObject({ isDirty: false });
  });
});

describe('c. placeholders of a create the server merged onto an existing dog', () => {
  /**
   * An offline create of `dog-device` with two registrations, uploaded: the
   * RPC found AKC X1 on `dog-existing`, returned that dog and inserted
   * nothing, and the upload remapped the placeholders' dog id.
   */
  async function mergedCreate() {
    const placeholders = await table.createLocalRegistrationsForDog('dog-device', [
      {
        organization: 'AKC',
        number: 'X1',
        registeredName: 'Merged',
        type: 'Beagle',
        status: 'active',
      },
      {
        organization: 'UKC',
        number: 'Y2',
        registeredName: 'Merged',
        type: 'Beagle',
        status: 'active',
      },
    ]);
    for (const placeholder of placeholders) {
      await table.set(placeholder.id, { ...placeholder, dogId: 'dog-existing' }, false);
    }
    await new ReplicatedDogsTable().set(
      'dog-existing',
      { id: 'dog-existing', name: 'Existing', callName: 'Existing', breed: 'Beagle' },
      false
    );
    const existing = serverRow({
      id: 'srv-x1',
      dog_id: 'dog-existing',
      organization: 'AKC',
      registration_number: 'X1',
      created_at: '2020-01-01T00:00:00Z',
    });
    return { placeholders, existing };
  }

  it('removes every placeholder of that create once one resolves', async () => {
    const { placeholders, existing } = await mergedCreate();
    await table.applyServerRows([existing]);

    await table.removeResolvedPlaceholders();

    for (const placeholder of placeholders) {
      expect(await table.getReplicatedRow(placeholder.id)).toBeNull();
    }
  });

  it('readers hide the siblings, online and offline', async () => {
    const { existing } = await mergedCreate();
    const unsent = await table.getUnsentWorkForDogs(['dog-existing']);

    expect(mergeUnsentWork([existing], unsent).map(row => row.id)).toEqual(['srv-x1']);

    await table.applyServerRows([existing]);
    expect((await table.getRegistrationsForDogs(['dog-existing'])).map(row => row.id)).toEqual([
      'srv-x1',
    ]);
  });

  it('keeps a sibling of a create that was NOT merged until its own copy arrives', async () => {
    const placeholders = await table.createLocalRegistrationsForDog('dog-device', [
      {
        organization: 'AKC',
        number: 'X1',
        registeredName: 'New',
        type: 'Beagle',
        status: 'active',
      },
      {
        organization: 'UKC',
        number: 'Y2',
        registeredName: 'New',
        type: 'Beagle',
        status: 'active',
      },
    ]);
    await new ReplicatedDogsTable().set(
      'dog-device',
      { id: 'dog-device', name: 'New', callName: 'New', breed: 'Beagle' },
      false
    );
    await table.applyServerRows([
      serverRow({
        id: 'srv-x1',
        dog_id: 'dog-device',
        organization: 'AKC',
        registration_number: 'X1',
      }),
    ]);

    await table.removeResolvedPlaceholders();

    expect(await table.getReplicatedRow(placeholders[0]!.id)).toBeNull();
    expect(await table.getReplicatedRow(placeholders[1]!.id)).not.toBeNull();
  });
});
