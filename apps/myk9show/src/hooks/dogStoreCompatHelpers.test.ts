/**
 * Edit dog's registration fields are saved through the registrations queue
 * (MYK9-1090): a matching organization is edited (UPDATE), a new one is added
 * (INSERT), offline, with no PostgREST write. On a replica that never synced,
 * offline, the save is refused and nothing is queued.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { REGISTRATION_UPDATE_COLUMNS } from '@/services/replication/dogRegistrationRows';
import { REGISTRATIONS_NEED_CONNECTION } from '@/services/replication/dogRegistrationWrites';
import { serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from '@/services/replication/__tests__/registrationQueueHarness';
import { syncDogRegistrations } from './dogStoreCompatHelpers';

let queue: RegistrationQueueHarness;

const FORM = [
  { organization: 'AKC', registeredName: 'CH New Name', type: 'Beagle', status: 'Active' },
  { organization: 'UKC', registeredName: 'UKC Name', number: 'P77', status: 'Active' },
];

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  vi.mocked(supabase.from).mockClear();
  setDeviceOnline(false);
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

describe('syncDogRegistrations, offline', () => {
  it('edits the matching organization and adds the new one, queued', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'reg-akc', organization: 'AKC', version: 5 }),
    ]);
    await replicatedDogRegistrationsTable.updateSyncMetadata({ lastFullSyncAt: Date.now() });

    await expect(syncDogRegistrations('dog-1', FORM)).resolves.toBe(true);

    const pending = await queue.pending();
    const update = pending.find(m => m.operation === 'UPDATE');
    expect(update).toMatchObject({
      rowId: 'reg-akc',
      serverVersion: 5,
      data: { registered_name: 'CH New Name', breed: 'Beagle', status: 'Active' },
    });
    expect(
      Object.keys(update!.data).every(key => ['id', ...REGISTRATION_UPDATE_COLUMNS].includes(key))
    ).toBe(true);
    expect(pending.find(m => m.operation === 'INSERT')).toMatchObject({
      data: { dog_id: 'dog-1', organization: 'UKC', registration_number: 'P77' },
    });
    expect(pending).toHaveLength(2);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('refuses on a replica that never synced and queues nothing', async () => {
    await expect(syncDogRegistrations('dog-1', FORM)).rejects.toThrow(
      REGISTRATIONS_NEED_CONNECTION
    );
    expect(await queue.pending()).toEqual([]);
  });
});
