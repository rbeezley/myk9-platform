/**
 * The registrations ID pass (MYK9-1090, plan §1): fetch what came into view,
 * remove what left it, and never remove a row this device still owes the
 * server, a row written after the pass began, or a placeholder whose dog has
 * not uploaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { databaseManager } from '@myk9/replication';
import { ReplicatedDogRegistrationsTable } from '../ReplicatedDogRegistrationsTable';
import { ReplicatedDogsTable, type ReplicatedDog } from '../ReplicatedDogsTable';
import { DOG_REGISTRATION_ID_PASS_MAX_PAGES } from '../dogRegistrationsIdPass';
import {
  installRegistrationsServer,
  newServer,
  putQueueRecord,
  serverRow,
  trustReplica,
} from './dogRegistrationFixtures';
import { readRegistrationsTrust, resetRegistrationsTrustForTests } from '../dogRegistrationsTrust';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let table: ReplicatedDogRegistrationsTable;

beforeEach(async () => {
  await resetRegistrationsTrustForTests();
  await trustReplica();
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

  it('keeps a placeholder while its dog still has a pending dog mutation', async () => {
    const id = await placeholderFor('dog-offline');
    await putQueueRecord('pending', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-offline' });
    serverShows('reg-gone');

    await table.reconcileWithServerIds();

    expect(await table.get(id)).not.toBeNull();
  });

  it('keeps a placeholder while its dog has a failed dog mutation', async () => {
    const id = await placeholderFor('dog-offline');
    await putQueueRecord('failed', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-offline' });
    serverShows('reg-gone');

    await table.reconcileWithServerIds();

    expect(await table.get(id)).not.toBeNull();
  });

  // An offline create writes the dog dirty, then queues its upload: between
  // the two, no dogs mutation names the dog yet (Codex review, P2).
  it('keeps a placeholder while its dog row is dirty with nothing queued yet', async () => {
    const id = await placeholderFor('dog-offline');
    // Dirty alone, so this pins the dirty check apart from the local-only one.
    await new ReplicatedDogsTable().set(
      'dog-offline',
      { ...offlineDog(), _localOnly: undefined },
      true
    );
    serverShows('reg-gone');

    await table.reconcileWithServerIds();

    expect(await table.get(id)).not.toBeNull();
  });

  it('keeps a placeholder while its dog exists only on this device', async () => {
    const id = await placeholderFor('dog-offline');
    await new ReplicatedDogsTable().set('dog-offline', offlineDog(), false);
    serverShows('reg-gone');

    await table.reconcileWithServerIds();

    expect(await table.get(id)).not.toBeNull();
  });

  it('removes a placeholder once its dog has uploaded', async () => {
    const id = await placeholderFor('dog-offline');
    // The uploaded dog: clean and no longer local-only.
    await new ReplicatedDogsTable().set(
      'dog-offline',
      { ...offlineDog(), _localOnly: undefined },
      false
    );
    // Another dog's queued work does not hold this placeholder.
    await putQueueRecord('pending', { id: 'm-dog', tableName: 'dogs', rowId: 'dog-other' });
    serverShows('reg-gone');

    await table.reconcileWithServerIds();

    expect(await table.get(id)).toBeNull();
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
    // An incomplete id set is a doubt: the replica stops answering alone.
    expect(await readRegistrationsTrust()).toBeNull();
  });

  it('removes nothing when any id page fails', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `srv-${i}` }));
    installRegistrationsServer(newServer({ idPages: [fullPage, new Error('timeout')] }));

    await expect(table.reconcileWithServerIds()).resolves.toBeNull();

    expect(await table.get('reg-gone')).not.toBeNull();
    expect(await table.get('reg-kept')).not.toBeNull();
    expect(await readRegistrationsTrust()).toBeNull();
  });
});
