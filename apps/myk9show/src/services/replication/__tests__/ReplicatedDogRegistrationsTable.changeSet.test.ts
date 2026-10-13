/**
 * One pending change set per registration row (Codex round 5): every edit,
 * and every reconcile against a newer server copy, recomputes the row's single
 * queued UPDATE as the columns whose local value differs from the server base,
 * plus `updated_at`. Edits that cancel out queue nothing; a column both sides
 * changed differently is a conflict, never a silent rebase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
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

const BASE = serverRow({ id: 'reg-1', registered_name: 'A', breed: 'Beagle', version: 3 });

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  setDeviceOnline(false);
  await table.applyServerRows([BASE]);
  queue.server.set('reg-1', { ...BASE });
});

afterEach(async () => {
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

/** Another device saved `overrides`: the server and the next sync both see it. */
async function anotherDeviceSaves(overrides: Parameters<typeof serverRow>[0]) {
  const remote = serverRow({ ...BASE, ...overrides, version: 4 });
  queue.server.set('reg-1', { ...remote });
  installRegistrationsServer(
    newServer({ changePages: [[remote]], idPages: [[{ id: 'reg-1' }]], rows: [remote] })
  );
  await table.sync();
}

const updates = async () => (await queue.pending()).filter(m => m.operation === 'UPDATE');

describe('one pending change set per row', () => {
  it('A→B→A offline while another device sets C: C survives, nothing overwrites it', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'B' });
    await table.updateRegistration('reg-1', { registered_name: 'A' });
    await anotherDeviceSaves({ registered_name: 'C' });

    setDeviceOnline(true);
    await queue.upload();

    expect(queue.sent.filter(([op]) => op === 'update')).toEqual([]);
    expect(queue.server.get('reg-1')).toMatchObject({ registered_name: 'C' });
    expect(await table.get('reg-1')).toMatchObject({ registeredName: 'C' });
  });

  it('two edits to different columns combine into one UPDATE', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'B' });
    await table.updateRegistration('reg-1', { breed: 'Basset Hound' });

    const [update, ...rest] = await updates();
    expect(rest).toEqual([]);
    expect(update).toMatchObject({ serverVersion: 3 });
    expect(Object.keys(update!.data).sort()).toEqual(['breed', 'registered_name', 'updated_at']);
    expect(update!.data).toMatchObject({ registered_name: 'B', breed: 'Basset Hound' });
  });

  it('edits that cancel out queue nothing and leave the row as the server has it', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'B' });
    await table.updateRegistration('reg-1', { registered_name: 'A' });

    expect(await queue.pending()).toEqual([]);
    const row = await table.getReplicatedRow('reg-1');
    expect(row).toMatchObject({ isDirty: false, data: { registeredName: 'A' } });
  });

  it('a column both sides changed differently is a conflict, and nothing uploads', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'B' });
    await anotherDeviceSaves({ registered_name: 'C' });

    setDeviceOnline(true);
    await queue.upload();

    expect((await table.getReplicatedRow('reg-1'))?.syncStatus).toBe('conflict');
    expect(queue.sent.filter(([op]) => op === 'update')).toEqual([]);
    expect(queue.server.get('reg-1')).toMatchObject({ registered_name: 'C' });
  });

  it('a server change to another column is merged and the set is recomputed on the new token', async () => {
    await table.updateRegistration('reg-1', { registered_name: 'B' });
    await anotherDeviceSaves({ breed: 'Basset Hound' });

    const [update, ...rest] = await updates();
    expect(rest).toEqual([]);
    expect(update).toMatchObject({ serverVersion: 4 });
    expect(Object.keys(update!.data).sort()).toEqual(['registered_name', 'updated_at']);
    setDeviceOnline(true);
    await queue.upload();
    expect(queue.server.get('reg-1')).toMatchObject({
      registered_name: 'B',
      breed: 'Basset Hound',
    });
  });
});
