/**
 * The registrations changes pass (MYK9-1090, plan §1): exact column list,
 * no scope, keyset paging, the first sync is a full one, and a clean row
 * takes the server's copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { ReplicatedDogRegistrationsTable } from '../ReplicatedDogRegistrationsTable';
import {
  REGISTRATION_UPDATE_COLUMNS,
  registrationToDbRow,
  rowToRegistration,
} from '../dogRegistrationRows';
import {
  installRegistrationsServer,
  newServer,
  serverRow,
  signedInAs,
  TEST_AUTH_USER,
  trustReplica,
} from './dogRegistrationFixtures';
import { readRegistrationsTrust, resetRegistrationsTrustForTests } from '../dogRegistrationsTrust';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** Pinned literally, not imported: the test must fail if the list drifts. */
const EXPECTED_SELECT =
  'id, dog_id, organization, registration_number, registration_date, verified, created_at, updated_at, registered_name, breed, variety, status, application_number, submission_date, certificate, is_primary, version';

let table: ReplicatedDogRegistrationsTable;

beforeEach(async () => {
  await resetRegistrationsTrustForTests();
  signedInAs(TEST_AUTH_USER);
  await databaseManager.reset();
  table = new ReplicatedDogRegistrationsTable();
});

afterEach(async () => {
  await resetRegistrationsTrustForTests();
  await databaseManager.reset();
});

describe('registrations changes pass', () => {
  it('reads the exact column list with no scope filter, paged by (updated_at, id)', async () => {
    const full = Array.from({ length: 1000 }, (_, i) =>
      serverRow({ id: `reg-${String(i).padStart(4, '0')}`, updated_at: '2026-10-01T00:00:00Z' })
    );
    const server = newServer({
      changePages: [full, [serverRow({ id: 'reg-last', updated_at: '2026-10-02T00:00:00Z' })]],
      // The ID pass sees the same rows, so it removes nothing.
      idPages: [full.map(({ id }) => ({ id })), [{ id: 'reg-last' }]],
    });
    installRegistrationsServer(server);

    const result = await table.sync();

    expect(result.success).toBe(true);
    const selects = server.calls.filter(c => c.method === 'select').map(c => c.args[0]);
    expect(selects.slice(0, 2)).toEqual([EXPECTED_SELECT, EXPECTED_SELECT]);
    expect(selects.some(columns => String(columns).includes('*'))).toBe(false);
    expect(server.calls.some(c => c.method === 'eq')).toBe(false);
    expect(server.calls.find(c => c.method === 'gt')?.args[0]).toBe('updated_at');
    expect(server.calls.find(c => c.method === 'or')?.args[0]).toBe(
      'updated_at.gt.2026-10-01T00:00:00Z,and(updated_at.eq.2026-10-01T00:00:00Z,id.gt.reg-0999)'
    );
    expect(
      server.calls
        .filter(c => c.method === 'order')
        .map(c => c.args[0])
        .slice(0, 2)
    ).toEqual(['updated_at', 'id']);
    expect(await table.get('reg-last')).toMatchObject({ dogId: 'dog-1' });
  });

  it('makes the first sync a full one even when offline-created placeholders are present', async () => {
    await table.createLocalRegistrationsForDog('dog-offline', [
      {
        organization: 'AKC',
        number: 'SR1',
        registeredName: 'Placeholder',
        type: 'Beagle',
        status: 'active',
      },
    ]);
    const server = newServer({ changePages: [[serverRow()]], idPages: [[{ id: 'reg-1' }]] });
    installRegistrationsServer(server);

    await table.sync();

    expect(server.calls.find(c => c.method === 'gt')?.args).toEqual([
      'updated_at',
      new Date(0).toISOString(),
    ]);
    expect((await readRegistrationsTrust())?.authUserId).toBe(TEST_AUTH_USER);
    expect((await table.readForDogs(['dog-1'])).state).toBe('warm');
  });

  it('replaces a clean local row with the server copy', async () => {
    await table.applyServerRows([serverRow({ registered_name: 'Old Name', version: 2 })]);
    installRegistrationsServer(
      newServer({
        changePages: [[serverRow({ registered_name: 'New Name', version: 3 })]],
        idPages: [[{ id: 'reg-1' }]],
      })
    );

    await table.sync();

    expect(await table.get('reg-1')).toMatchObject({ registeredName: 'New Name' });
    expect((await table.getReplicatedRow('reg-1'))?.serverVersion).toBe(3);
  });

  it('raises a conflict when the server changed a field this device is still editing', async () => {
    configureConflictSurfacing(true);
    try {
      await table.applyServerRows([serverRow({ registered_name: 'Base', version: 2 })]);
      const local = await table.get('reg-1');
      await table.set('reg-1', { ...local!, registeredName: 'Mine' }, true);
      installRegistrationsServer(
        newServer({
          changePages: [[serverRow({ registered_name: 'Theirs', version: 3 })]],
          idPages: [[{ id: 'reg-1' }]],
        })
      );

      await table.sync();

      const row = await table.getReplicatedRow('reg-1');
      expect(row?.syncStatus).toBe('conflict');
      expect(row?.data.registeredName).toBe('Mine');
    } finally {
      configureConflictSurfacing(false);
    }
  });
});

function fullServer() {
  return newServer({
    changePages: [[serverRow({ id: 'r1' }), serverRow({ id: 'r2' }), serverRow({ id: 'r3' })]],
    idPages: [[{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]],
  });
}

// Only a clean full sync for the signed-in account earns trust (Codex round 2).
describe('registrations replica trust earned by sync', () => {
  it('distrusts another account at sync start, forces a full fetch, and trusts only the new one', async () => {
    await trustReplica('auth-a');
    signedInAs('auth-b');
    const server = fullServer();
    installRegistrationsServer(server);

    await table.sync();

    expect(server.calls.find(c => c.method === 'gt')?.args[1]).toBe(new Date(0).toISOString());
    expect((await readRegistrationsTrust())?.authUserId).toBe('auth-b');
    signedInAs('auth-a');
    expect((await table.readForDogs(['dog-1'])).state).toBe('cold');
  });

  it('runs incrementally and keeps trust when the replica is already trusted for this account', async () => {
    await table.applyServerRows([serverRow({ id: 'r1' })]);
    await table.updateSyncMetadata({ lastIncrementalSyncAt: Date.parse('2026-10-01T00:00:00Z') });
    await trustReplica();
    const before = await readRegistrationsTrust();
    const server = fullServer();
    installRegistrationsServer(server);

    await table.sync();

    expect(server.calls.find(c => c.method === 'gt')?.args[1]).not.toBe(new Date(0).toISOString());
    expect(await readRegistrationsTrust()).toEqual(before);
  });

  it('does not earn trust without a resolved account', async () => {
    signedInAs(null);
    installRegistrationsServer(fullServer());

    await table.sync();

    expect(await readRegistrationsTrust()).toBeNull();
  });

  it('does not earn trust when the ID pass cannot hydrate a missing id, and the next clean sync does', async () => {
    const server = fullServer();
    server.idPages = [[{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }]];
    installRegistrationsServer(server);
    server.failIdLookups = true;

    await table.sync();

    expect(await readRegistrationsTrust()).toBeNull();
    installRegistrationsServer(fullServer());
    await table.sync();
    expect((await readRegistrationsTrust())?.authUserId).toBe(TEST_AUTH_USER);
  });

  it('stops trusting the replica when a later ID pass cannot hydrate a missing id', async () => {
    await table.applyServerRows([serverRow({ id: 'r1' })]);
    await table.updateSyncMetadata({ lastIncrementalSyncAt: Date.parse('2026-10-01T00:00:00Z') });
    await trustReplica();
    const server = newServer({ idPages: [[{ id: 'r1' }, { id: 'r-new' }]] });
    server.failIdLookups = true;
    installRegistrationsServer(server);

    await table.sync();

    expect(await readRegistrationsTrust()).toBeNull();
  });

  it('does not earn trust when an ID page fails', async () => {
    const server = fullServer();
    server.idPages = [new Error('timeout')];
    installRegistrationsServer(server);

    await table.sync();

    expect(await readRegistrationsTrust()).toBeNull();
  });
});

/** Run a quota eviction as the package does on a storage-quota failure. */
async function evictUnderQuota(): Promise<number> {
  // Rows touched in the last few minutes are protected; step past that.
  const later = Date.now() + 60 * 60 * 1000;
  const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
  try {
    return await table.relieveQuota();
  } finally {
    clock.mockRestore();
  }
}

async function warmReplicaWithRows(): Promise<void> {
  installRegistrationsServer(
    newServer({
      changePages: [[serverRow({ id: 'r1' }), serverRow({ id: 'r2' }), serverRow({ id: 'r3' })]],
      idPages: [[{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]],
    })
  );
  await table.sync();
  expect((await table.readForDogs(['dog-1'])).state).toBe('warm');
}

// A quota eviction drops clean rows: the replica is no longer every visible
// registration, so "none here" stops meaning "none" (Codex review, P2).
describe('registrations coverage after a quota eviction', () => {
  it('goes cold, and the next sync is a full one that makes it warm again', async () => {
    await warmReplicaWithRows();

    expect(await evictUnderQuota()).toBeGreaterThan(0);
    expect((await table.readForDogs(['dog-1'])).state).toBe('cold');

    const server = newServer({
      changePages: [[serverRow({ id: 'r1' }), serverRow({ id: 'r2' }), serverRow({ id: 'r3' })]],
      idPages: [[{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]],
    });
    installRegistrationsServer(server);
    await table.sync();

    expect(server.calls.find(c => c.method === 'gt')?.args).toEqual([
      'updated_at',
      new Date(0).toISOString(),
    ]);
    expect((await table.readForDogs(['dog-1'])).state).toBe('warm');
    expect(await table.getAllLocalIds()).toEqual(new Set(['r1', 'r2', 'r3']));
  });

  it('stays cold when the eviction lands during the sync that would restore it', async () => {
    await warmReplicaWithRows();
    await evictUnderQuota();
    const server = newServer({
      changePages: [[serverRow({ id: 'r1' })]],
      idPages: [[{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]],
    });
    server.onChangePage = async () => {
      await evictUnderQuota();
    };
    installRegistrationsServer(server);

    await table.sync();

    expect((await table.readForDogs(['dog-1'])).state).toBe('cold');
  });
});

describe('registrations row mapping', () => {
  it('round-trips every read column through the local row', () => {
    const { version, ...readColumns } = serverRow({ variety: 'Rough', certificate: 'c.pdf' });

    expect(version).toBe(3);
    expect(
      registrationToDbRow(rowToRegistration(serverRow({ variety: 'Rough', certificate: 'c.pdf' })))
    ).toEqual(readColumns);
  });

  it('builds an UPDATE payload from the allowlisted columns only', async () => {
    await table.applyServerRows([serverRow()]);
    const payload = (
      table as unknown as { rebuildUpdatePayload: (row: unknown) => Record<string, unknown> }
    ).rebuildUpdatePayload(await table.get('reg-1'));

    expect(Object.keys(payload).sort()).toEqual([...REGISTRATION_UPDATE_COLUMNS].sort());
  });

  it('re-fetches rows by id with the same column list', async () => {
    const server = newServer({ rows: [serverRow()] });
    installRegistrationsServer(server);
    const adapter = (
      table as unknown as {
        getRowRefetchAdapter: () => { fetchRowsById: (ids: string[]) => Promise<unknown[]> };
      }
    ).getRowRefetchAdapter();

    await expect(adapter.fetchRowsById(['reg-1'])).resolves.toHaveLength(1);
    expect(server.calls[0]).toEqual({ method: 'select', args: [EXPECTED_SELECT] });
    expect(server.calls[1]).toEqual({ method: 'in', args: ['id', ['reg-1']] });
  });
});
