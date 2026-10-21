/**
 * The registrations ID pass (MYK9-1090, plan §1): fetch what came into view,
 * remove what left it, and never remove a row this device still owes the
 * server, a row written after the pass began, or a placeholder whose dog has
 * not uploaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager, REPLICATION_STORES } from '@myk9/replication';
import { ReplicatedDogRegistrationsTable } from '../ReplicatedDogRegistrationsTable';
import { ReplicatedDogsTable, type ReplicatedDog } from '../ReplicatedDogsTable';
import { DOG_REGISTRATION_ID_PASS_MAX_PAGES } from '../dogRegistrationsIdPass';
import { ID_SCAN_INTERVAL_MS } from '../idScanCadence';
import {
  installRegistrationsServer,
  newServer,
  putQueueRecord,
  serverRow,
} from './dogRegistrationFixtures';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let table: ReplicatedDogRegistrationsTable;

beforeEach(async () => {
  await databaseManager.reset();
  table = new ReplicatedDogRegistrationsTable();
  // Two synced registrations on this device.
  await table.applyServerRows([
    serverRow({ id: 'reg-kept' }),
    serverRow({ id: 'reg-gone', organization: 'UKC', registration_number: 'P1' }),
  ]);
});

afterEach(async () => {
  await databaseManager.reset();
});

/** The server shows only `reg-kept` (and whatever else is listed). */
function serverShows(...extraIds: string[]) {
  const server = newServer({
    idPages: [[{ id: 'reg-kept' }, ...extraIds.map(id => ({ id }))]],
  });
  installRegistrationsServer(server);
  return server;
}

function offlineDog(): ReplicatedDog {
  return { id: 'dog-offline', name: 'Scout', callName: 'Scout', breed: '', _localOnly: true };
}

async function placeholderFor(dogId: string): Promise<string> {
  const [placeholder] = await table.createLocalRegistrationsForDog(dogId, [
    {
      organization: 'AKC',
      number: 'SR99',
      registeredName: 'Offline Dog',
      type: 'Beagle',
      status: 'active',
    },
  ]);
  return placeholder!.id;
}

describe('registrations ID pass', () => {
  it('fetches a registration that came into view without an edit, and stores it clean', async () => {
    const server = serverShows('reg-new');
    server.rows = [serverRow({ id: 'reg-new', dog_id: 'dog-2', version: 7 })];

    await expect(table.reconcileWithServerIds()).resolves.toEqual({ removed: 1, fetched: 1 });

    const row = await table.getReplicatedRow('reg-new');
    expect(row).toMatchObject({ isDirty: false, serverVersion: 7, data: { dogId: 'dog-2' } });
    expect(server.calls).toContainEqual({ method: 'in', args: ['id', ['reg-new']] });
  });

  // A hard delete, a dog soft delete (RLS hides its registrations through
  // `dog_deleted_at`) and a dog leaving this account all read the same way:
  // the id is no longer in the visible set.
  it('removes a registration the server no longer shows', async () => {
    serverShows();

    await table.reconcileWithServerIds();

    expect(await table.get('reg-gone')).toBeNull();
    expect(await table.get('reg-kept')).not.toBeNull();
  });

  it('keeps a row a pending mutation names', async () => {
    await putQueueRecord('pending', {
      id: 'm1',
      tableName: 'dog_registrations',
      rowId: 'reg-gone',
    });
    serverShows();

    await table.reconcileWithServerIds();

    expect(await table.get('reg-gone')).not.toBeNull();
  });

  it('keeps a row a failed mutation names', async () => {
    await putQueueRecord('failed', { id: 'm1', tableName: 'dog_registrations', rowId: 'reg-gone' });
    serverShows();

    await table.reconcileWithServerIds();

    expect(await table.get('reg-gone')).not.toBeNull();
  });

  it('keeps a dirty row', async () => {
    const row = await table.get('reg-gone');
    await table.set('reg-gone', { ...row!, registeredName: 'Edited' }, true);
    serverShows();

    await table.reconcileWithServerIds();

    expect(await table.get('reg-gone')).not.toBeNull();
  });

  it('keeps a row written locally after the pass began', async () => {
    const server = serverShows();
    server.onIdPage = async () => {
      // A clean write landing while the id pages are in flight (an upload
      // acknowledged, a direct write mirrored): the id set may predate it.
      await table.applyServerRows([
        serverRow({ id: 'reg-gone', registered_name: 'Rewritten', version: 9 }),
      ]);
    };

    await table.reconcileWithServerIds();

    expect(await table.get('reg-gone')).toMatchObject({ registeredName: 'Rewritten' });
  });

  it('removes nothing when the page cap is reached', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `srv-${i}` }));
    installRegistrationsServer(
      newServer({
        idPages: Array.from({ length: DOG_REGISTRATION_ID_PASS_MAX_PAGES }, () => fullPage),
      })
    );

    await expect(table.reconcileWithServerIds()).resolves.toBeNull();

    expect(await table.get('reg-gone')).not.toBeNull();
  });

  it('removes nothing when any id page fails', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `srv-${i}` }));
    installRegistrationsServer(newServer({ idPages: [fullPage, new Error('timeout')] }));

    await expect(table.reconcileWithServerIds()).resolves.toBeNull();

    expect(await table.get('reg-gone')).not.toBeNull();
    expect(await table.get('reg-kept')).not.toBeNull();
  });
});

/** The dog row as the upload leaves it: clean and no longer local-only. */
function uploadedDog(): ReplicatedDog {
  return { ...offlineDog(), _localOnly: undefined };
}

/** The server's copy of a placeholder: a new id, the creation instant it was sent. */
const serverTwin = async (placeholderId: string) =>
  serverRow({
    id: 'srv-twin',
    dog_id: 'dog-offline',
    organization: 'AKC',
    registration_number: 'SR99',
    created_at: (await table.get(placeholderId))!.createdAt,
  });

// Placeholders are removed by content, never by the server id set (Codex
// rounds 4 and 5: every timing-based guard had a window).
describe('offline-created placeholders', () => {
  it('survive an ID pass when their dog uploads while the id response is in flight', async () => {
    const id = await placeholderFor('dog-offline');
    const dogs = new ReplicatedDogsTable();
    await dogs.set('dog-offline', offlineDog(), true);
    await putQueueRecord('pending', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-offline' });
    const server = serverShows('reg-gone');
    server.onIdPage = async () => {
      // The dog's upload is acknowledged: clean row, queue record gone. The
      // id set being read predates the server rows that replace the placeholder.
      await dogs.markAsSynced('dog-offline');
      await dogs.set('dog-offline', uploadedDog(), false);
      expect((await dogs.getReplicatedRow('dog-offline'))?.isDirty).toBe(false);
      const db = await databaseManager.getDatabase('dog_registrations');
      await db.delete(REPLICATION_STORES.PENDING_MUTATIONS, 'm-dog');
    };

    await table.reconcileWithServerIds();

    expect(await table.get(id)).not.toBeNull();
  });

  it('are removed once their server twin is on the device', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);
    await table.applyServerRows([await serverTwin(id)]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(id)).toBeNull();
    expect(await table.get('srv-twin')).not.toBeNull();
  });

  it('stay while the dog has uploaded but its server rows have not arrived', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);

    await table.removeResolvedPlaceholders();

    expect(await table.get(id)).not.toBeNull();
  });

  // The dog uploaded, its server row reached the device only as a write
  // loaded it, and it is deleted. Without the deleted row as a twin the
  // placeholder outlives it and shows the deleted registration again.
  it('are removed with the confirmed delete of their server twin', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);
    await table.applyServerRows([await serverTwin(id)]);

    await table.deleteRegistration('srv-twin');
    await table.confirmDeleted(['srv-twin']);

    expect(await table.get('srv-twin')).toBeNull();
    expect(await table.get(id)).toBeNull();
  });

  it('stay when a delete of an unrelated registration is confirmed', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);
    await table.applyServerRows([
      serverRow({ id: 'srv-other', dog_id: 'dog-offline', created_at: '2020-01-01T00:00:00Z' }),
    ]);

    await table.deleteRegistration('srv-other');
    await table.confirmDeleted(['srv-other']);

    expect(await table.get(id)).not.toBeNull();
  });

  it('are removed as orphans when their dog is gone and nothing is queued for it', async () => {
    const id = await placeholderFor('dog-offline');
    // Another dog's queued work does not hold this placeholder.
    await putQueueRecord('pending', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-other' });

    await table.removeResolvedPlaceholders();

    expect(await table.get(id)).toBeNull();
  });

  it('stay as orphans while a failed dog mutation still names the dog', async () => {
    const id = await placeholderFor('dog-offline');
    await putQueueRecord('failed', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-offline' });

    await table.removeResolvedPlaceholders();

    expect(await table.get(id)).not.toBeNull();
  });

  it('stay as orphans while a pending dog mutation still names the dog', async () => {
    const id = await placeholderFor('dog-offline');
    await putQueueRecord('pending', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-offline' });

    await table.removeResolvedPlaceholders();

    expect(await table.get(id)).not.toBeNull();
  });

  it('are removed in the sync whose changes pass brings their twin', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);
    const twin = await serverTwin(id);
    installRegistrationsServer(
      newServer({
        changePages: [[serverRow({ id: 'reg-kept' }), twin]],
        idPages: [[{ id: 'reg-kept' }, { id: 'srv-twin' }]],
      })
    );

    await table.sync();

    expect(await table.get(id)).toBeNull();
    expect(await table.get('srv-twin')).not.toBeNull();
  });
});
/** Placeholders for `dog-offline` with these numbers, created in one batch. */
async function placeholdersWithNumbers(...numbers: string[]) {
  return table.createLocalRegistrationsForDog(
    'dog-offline',
    numbers.map(number => ({
      organization: 'AKC',
      number,
      registeredName: 'Offline Dog',
      type: 'Beagle',
      status: 'active',
    }))
  );
}

/** The server's copy of a placeholder: a new id, the creation instant it was sent. */
function serverCopyOf(
  placeholder: { createdAt: string; registrationNumber: string },
  id: string,
  createdAt: string = placeholder.createdAt
) {
  return serverRow({
    id,
    dog_id: 'dog-offline',
    organization: 'AKC',
    registration_number: placeholder.registrationNumber,
    created_at: createdAt,
  });
}

// The twin key is (dog, created_at): a placeholder without a number has no
// (organization, number) identity, and would otherwise show beside its
// server copy for good (Codex review).
describe('placeholder twins by creation instant', () => {
  beforeEach(async () => {
    await new ReplicatedDogsTable().set('dog-offline', uploadedDog(), false);
  });

  it('removes a placeholder with no number once its server copy arrives', async () => {
    const [placeholder] = await placeholdersWithNumbers('');
    await table.applyServerRows([serverCopyOf(placeholder!, 'srv-a')]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(placeholder!.id)).toBeNull();
  });

  // create_dog_with_registrations maps an offline create onto an EXISTING dog
  // that already holds the number: no new row, so no created_at twin, and the
  // placeholder's dog id is remapped to that dog, which is present. Without
  // the number match it stayed for good and showed as a duplicate (review).
  it('removes a placeholder whose dog was mapped onto an existing dog that holds the number', async () => {
    const [placeholder] = await placeholdersWithNumbers('X123');
    await table.applyServerRows([
      serverCopyOf(placeholder!, 'srv-existing', '2020-01-01T00:00:00+00:00'),
    ]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(placeholder!.id)).toBeNull();
  });

  it('matches across timestamp formats (server +00:00, device Z)', async () => {
    const [placeholder] = await placeholdersWithNumbers('');
    const serverFormat = placeholder!.createdAt.replace('Z', '+00:00');
    await table.applyServerRows([serverCopyOf(placeholder!, 'srv-a', serverFormat)]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(placeholder!.id)).toBeNull();
  });

  it('pairs each placeholder with its own server copy, not a sibling', async () => {
    const [first, second] = await placeholdersWithNumbers('', '');
    await table.applyServerRows([serverCopyOf(first!, 'srv-a')]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(first!.id)).toBeNull();
    expect(await table.get(second!.id)).not.toBeNull();
  });

  it('falls back to organization and number when a placeholder has no usable created_at', async () => {
    const [placeholder] = await placeholdersWithNumbers('SR55');
    await table.set(placeholder!.id, { ...placeholder!, createdAt: '' }, false);
    await table.applyServerRows([serverCopyOf(placeholder!, 'srv-a', '2020-01-01T00:00:00.000Z')]);

    await table.removeResolvedPlaceholders();

    expect(await table.get(placeholder!.id)).toBeNull();
  });
});

describe('registrations ID pass cadence (MYK9-1302)', () => {
  it('prunes on the first pass, skips an intermediate pass, and prunes again when an hour is up', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      serverShows();
      await table.sync();
      expect(await table.getAllLocalIds()).toEqual(new Set(['reg-kept']));

      // A second registration disappears on the server: not scanned right away.
      await table.applyServerRows([serverRow({ id: 'reg-late', organization: 'UKC' })]);
      installRegistrationsServer(newServer({ idPages: [[{ id: 'reg-kept' }]] }));
      vi.setSystemTime(Date.now() + 60_000);
      await table.sync();
      expect(await table.getAllLocalIds()).toContain('reg-late');

      vi.setSystemTime(Date.now() + ID_SCAN_INTERVAL_MS);
      await table.sync();
      expect(await table.getAllLocalIds()).toEqual(new Set(['reg-kept']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('a server count below the local rows forces a full sync and an id pass despite a fresh stamp', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      serverShows();
      await table.sync();
      await table.applyServerRows([serverRow({ id: 'reg-late', organization: 'UKC' })]);

      // reg-late was removed on the server: the count (1) is below the two local
      // rows. The engine's count runs about every ten minutes (MYK9-1301), so it is due.
      installRegistrationsServer(newServer({ idPages: [[{ id: 'reg-kept' }]], remoteCount: 1 }));
      vi.setSystemTime(Date.now() + 11 * 60_000);
      const result = await table.sync();

      expect(result.operation).toBe('full-sync');
      expect(await table.getAllLocalIds()).toEqual(new Set(['reg-kept']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not scan an intermediate pass when the count agrees with the local rows', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      serverShows();
      await table.sync();
      const quiet = newServer({ idPages: [[{ id: 'reg-kept' }]], remoteCount: 1 });
      installRegistrationsServer(quiet);
      vi.setSystemTime(Date.now() + 11 * 60_000);
      const result = await table.sync();

      expect(result.operation).toBe('incremental-sync');
      expect(quiet.calls.filter(call => call.method === 'count')).toHaveLength(1);
      // The id pass is a bare `select('id')`; the delta selects the row columns.
      const idReads = quiet.calls.filter(call => call.method === 'select' && call.args[0] === 'id');
      expect(idReads).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves the scan owed when the pass kept a row for the next pass', async () => {
    await placeholderFor('dog-offline');
    serverShows();
    const scan = vi.spyOn(table, 'reconcileWithServerIds');
    await table.sync();
    await table.sync();
    // The placeholder is never removed by the id set, so nothing was stamped.
    expect(scan).toHaveBeenCalledTimes(2);
  });
});
