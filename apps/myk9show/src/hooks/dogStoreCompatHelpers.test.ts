/**
 * Edit dog's registration fields are saved through the registrations queue
 * (MYK9-1090), with no PostgREST write:
 *
 * - Online, the candidates for "edit the matching organization, else add"
 *   are the server's rows plus this device's unsent work, never a cached copy
 *   the server no longer has (Codex review of PR 3a).
 * - When the server cannot be read, only an EDIT of a registration on the
 *   device is queued. A new organization cannot be told apart from one the
 *   device has not loaded, so the registration part is refused and nothing
 *   is queued. No coverage or trust signal decides it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { REGISTRATION_UPDATE_COLUMNS } from '@/services/replication/dogRegistrationRows';
import { REGISTRATION_CHANGES_NEED_CONNECTION } from '@/services/replication/dogRegistrationWrites';
import {
  installRegistrationsServer,
  newServer,
  serverRow,
} from '@/services/replication/__tests__/dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from '@/services/replication/__tests__/registrationQueueHarness';
import { syncDogRegistrations } from './dogStoreCompatHelpers';

let queue: RegistrationQueueHarness;

const AKC_EDIT = {
  organization: 'AKC',
  registeredName: 'CH New Name',
  type: 'Beagle',
  status: 'Active',
};
const UKC_NEW = {
  organization: 'UKC',
  registeredName: 'UKC Name',
  number: 'P77',
  status: 'Active',
};

/** The app client cannot reach the server: every read fails as offline. */
function serverUnreachable() {
  const offline = Promise.resolve({ data: null, error: { message: 'Failed to fetch' } });
  const builder = { select: () => builder, in: () => offline };
  vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
}

const writes = () =>
  vi
    .mocked(supabase.from)
    .mock.results.flatMap(result => Object.keys(result.value ?? {}))
    .filter(method => ['insert', 'update', 'delete', 'upsert'].includes(method));

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  vi.mocked(supabase.from).mockClear();
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

describe('syncDogRegistrations, server reachable', () => {
  beforeEach(() => {
    setDeviceOnline(true);
  });

  it('adds when the server has no row, even with a stale cached copy on the device', async () => {
    // Deleted on another device; this device still holds the clean copy.
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'reg-stale', organization: 'AKC', version: 5 }),
    ]);
    installRegistrationsServer(newServer({ rows: [] }));

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).resolves.toBe(true);
    await queue.upload();

    expect(queue.sent.map(([op]) => op)).toEqual(['insert']);
    expect(queue.sent[0]![2]).toMatchObject({
      organization: 'AKC',
      registered_name: 'CH New Name',
    });
  });

  it('edits the server row for a matching organization and adds a new one', async () => {
    installRegistrationsServer(
      newServer({ rows: [serverRow({ id: 'reg-akc', organization: 'AKC', version: 5 })] })
    );

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT, UKC_NEW])).resolves.toBe(true);
    await queue.upload();

    expect(queue.sent.map(([op]) => op).sort()).toEqual(['insert', 'update']);
    expect(queue.sent.find(([op]) => op === 'update')![2]).toMatchObject({
      id: 'reg-akc',
      registered_name: 'CH New Name',
    });
    expect(queue.sent.find(([op]) => op === 'insert')![2]).toMatchObject({
      dog_id: 'dog-1',
      organization: 'UKC',
      registration_number: 'P77',
    });
    expect(writes()).toEqual([]);
  });
});

describe('syncDogRegistrations, server unreachable', () => {
  beforeEach(() => {
    serverUnreachable();
    setDeviceOnline(false);
  });

  it('queues an edit of a registration on the device', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'reg-akc', organization: 'AKC', version: 5 }),
    ]);

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).resolves.toBe(true);

    const pending = await queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      operation: 'UPDATE',
      rowId: 'reg-akc',
      serverVersion: 5,
      data: { registered_name: 'CH New Name', breed: 'Beagle', status: 'Active' },
    });
    expect(
      Object.keys(pending[0]!.data).every(key =>
        ['id', ...REGISTRATION_UPDATE_COLUMNS].includes(key)
      )
    ).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('refuses an organization with no row on the device, and queues nothing', async () => {
    await replicatedDogRegistrationsTable.applyServerRows([
      serverRow({ id: 'reg-akc', organization: 'AKC', version: 5 }),
    ]);
    // A full sync on record changes nothing: absence is never read as "none".
    await replicatedDogRegistrationsTable.updateSyncMetadata({ lastFullSyncAt: Date.now() });

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT, UKC_NEW])).rejects.toThrow(
      REGISTRATION_CHANGES_NEED_CONNECTION
    );
    expect(await queue.pending()).toEqual([]);
  });
});
