/**
 * Queued registration writes (MYK9-1090 plan §3, MYK9-1075): add, edit and
 * delete write the device row, then queue the INSERT, full-row OCC UPDATE or
 * DELETE. Offline they send nothing; a refusal reaches Discard, which puts the
 * row back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { replicatedDogsTable } from '../ReplicatedDogsTable';
import { REGISTRATION_UPDATE_COLUMNS } from '../dogRegistrationRows';
import { REGISTRATIONS_NEED_CONNECTION } from '../dogRegistrationWrites';
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
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  // Every app-client read fails as offline: nothing here may need one.
  installRegistrationsServer(newServer());
  vi.mocked(supabase.from).mockClear();
  await table.applyServerRows([serverRow({ id: 'reg-1', registered_name: 'Old', version: 3 })]);
  setDeviceOnline(false);
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

describe('edit', () => {
  it('queues one OCC UPDATE of the changed columns only, and sends nothing offline', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'New', breed: 'Beagle' });
    await queue.settle();

    const [mutation, ...rest] = await queue.pending();
    expect(rest).toHaveLength(0);
    expect(mutation).toMatchObject({ operation: 'UPDATE', rowId: 'reg-1', serverVersion: 3 });
    expect(mutation!.data).toMatchObject({ registered_name: 'New', breed: 'Beagle' });
    // Only what changed travels (the server row's breed was Border Collie).
    expect(Object.keys(mutation!.data).sort()).toEqual(['breed', 'registered_name', 'updated_at']);
    expect(
      Object.keys(mutation!.data).every(key =>
        (REGISTRATION_UPDATE_COLUMNS as readonly string[]).includes(key)
      )
    ).toBe(true);
    expect(queue.sent).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(await table.get('reg-1')).toMatchObject({ registeredName: 'New', breed: 'Beagle' });
  });

  it('throws on a column outside the allowlist before anything is written or queued', async () => {
    await expect(
      table.updateRegistration('reg-1', { registered_name: 'New', dog_id: 'dog-2' })
    ).rejects.toThrow(/dog_id/);

    expect(await queue.pending()).toEqual([]);
    expect(await table.get('reg-1')).toMatchObject({ registeredName: 'Old', dogId: 'dog-1' });
  });

  it('a refused edit, discarded, puts the row back', async () => {
    setDeviceOnline(true);
    queue.answer.update = { data: null, error: { code: '42501', message: 'permission denied' } };
    await table.updateRegistration('reg-1', { registered_name: 'Refused' });
    await queue.upload();
    const [failed] = await queue.failed();
    expect(failed).toMatchObject({ operation: 'UPDATE', rowId: 'reg-1' });

    setDeviceOnline(false);
    await queue.manager.discardFailedMutation(failed!.id);

    const row = await table.getReplicatedRow('reg-1');
    expect(row).toMatchObject({ isDirty: false, data: { registeredName: 'Old' } });
  });

  it('refuses offline when the row is not on this device, and queues nothing', async () => {
    await expect(table.updateRegistration('reg-cold', { registered_name: 'X' })).rejects.toThrow(
      REGISTRATIONS_NEED_CONNECTION
    );
    expect(await queue.pending()).toEqual([]);
  });
});

describe('add', () => {
  it('queues an INSERT under the new row id and sends nothing offline', async () => {
    const added = await table.addRegistration({
      dog_id: 'dog-1',
      organization: 'UKC',
      registration_number: 'P1',
      registered_name: 'Added',
      variety: 'Smooth',
    });
    await queue.settle();

    const [mutation] = await queue.pending();
    expect(mutation).toMatchObject({ operation: 'INSERT', rowId: added.id });
    expect(mutation!.data).toMatchObject({
      id: added.id,
      dog_id: 'dog-1',
      organization: 'UKC',
      registration_number: 'P1',
      variety: 'Smooth',
    });
    expect(mutation!.dependsOn).toBeUndefined();
    expect(queue.sent).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('on a dog created offline, waits for the dog to upload', async () => {
    await replicatedDogsTable.createDogWithId({
      id: 'dog-new',
      name: 'Scout',
      callName: 'Scout',
      breed: 'Beagle',
      ownerId: 'owner-1',
    });
    const dogCreate = replicatedDogsTable.lastMutationId;
    expect(dogCreate).toBeTruthy();

    const added = await table.addRegistration({ dog_id: 'dog-new', registration_number: 'N1' });

    const insert = (await queue.pending()).find(m => m.rowId === added.id);
    expect(insert).toMatchObject({ operation: 'INSERT', dependsOn: [dogCreate] });
  });
});

describe('delete', () => {
  it('hides the row at once and queues a DELETE with no version check', async () => {
    await table.deleteRegistration('reg-1');

    expect(await table.getRegistrationsForDogs(['dog-1'])).toEqual([]);
    const unsent = await table.getUnsentWorkForDogs(['dog-1']);
    expect(mergeUnsentWork([serverRow({ id: 'reg-1' })], unsent)).toEqual([]);
    const [mutation] = await queue.pending();
    expect(mutation).toMatchObject({ operation: 'DELETE', rowId: 'reg-1', data: { id: 'reg-1' } });
    expect(mutation!.serverVersion).toBeUndefined();
    expect(queue.sent).toEqual([]);
  });

  it('survives an ID pass while it waits, whether or not the server still shows it', async () => {
    await table.deleteRegistration('reg-1');
    setDeviceOnline(true);
    for (const idPage of [[{ id: 'reg-1' }], []]) {
      installRegistrationsServer(newServer({ idPages: [idPage] }));
      await table.reconcileWithServerIds();
      expect(await table.getReplicatedRow('reg-1')).toMatchObject({
        data: { _pendingDelete: true },
      });
    }
  });

  // The confirmation is missed (the tab closed after the upload): nothing names
  // the row any more, and the next ID pass that finds it gone removes it.
  it('is removed by an ID pass once nothing names it and the server no longer shows it', async () => {
    await table.deleteRegistration('reg-1');
    await queue.manager.clearAllMutations();
    setDeviceOnline(true);
    installRegistrationsServer(newServer({ idPages: [[]] }));

    await table.reconcileWithServerIds();

    expect(await table.getReplicatedRow('reg-1')).toBeNull();
  });

  it('is removed from the device when the server confirms it', async () => {
    await table.deleteRegistration('reg-1');
    setDeviceOnline(true);

    await queue.upload();

    expect(queue.sent).toEqual([['delete', 'dog_registrations', undefined]]);
    expect(await table.getReplicatedRow('reg-1')).toBeNull();
  });

  it('of an add that has not uploaded cancels its INSERT and sends nothing', async () => {
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'P9' });

    await table.deleteRegistration(added.id);
    setDeviceOnline(true);
    await queue.upload();

    expect(await queue.pending()).toEqual([]);
    expect(queue.sent).toEqual([]);
    expect(await table.getReplicatedRow(added.id)).toBeNull();
  });

  it('a refused delete, discarded, shows the row again', async () => {
    setDeviceOnline(true);
    queue.answer.delete = { data: null, error: { code: '42501', message: 'permission denied' } };
    await table.deleteRegistration('reg-1');
    await queue.upload();
    const [failed] = await queue.failed();
    expect(failed).toMatchObject({ operation: 'DELETE', rowId: 'reg-1' });

    setDeviceOnline(false);
    await queue.manager.discardFailedMutation(failed!.id);

    expect(await table.getRegistrationsForDogs(['dog-1'])).toEqual([
      expect.objectContaining({ id: 'reg-1', registered_name: 'Old' }),
    ]);
    expect((await table.getReplicatedRow('reg-1'))?.isDirty).toBe(false);
  });
});
