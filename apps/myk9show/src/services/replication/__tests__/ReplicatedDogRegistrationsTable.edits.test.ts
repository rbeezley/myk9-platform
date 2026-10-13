/**
 * Codex review of PR 3a (MYK9-1090):
 *
 * 1. An edit and a server change to DIFFERENT fields merge: `updatedAt`, which
 *    both sides stamp, is bookkeeping, not a collision. A same-field change
 *    still surfaces.
 * 2. Editing an add whose INSERT the server has not acknowledged (still
 *    queued, or refused) replaces that INSERT: no UPDATE is ever queued
 *    against a row the server does not have, and the corrected value uploads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { replicatedDogsTable } from '../ReplicatedDogsTable';
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

describe('an edit meeting a server change', () => {
  /** The server's newer copy of reg-1, as a sync downloads it. */
  async function syncDownloads(overrides: Parameters<typeof serverRow>[0]) {
    installRegistrationsServer(
      newServer({
        changePages: [[serverRow({ id: 'reg-1', version: 4, ...overrides })]],
        idPages: [[{ id: 'reg-1' }]],
      })
    );
    await table.sync();
    return table.getReplicatedRow('reg-1');
  }

  beforeEach(async () => {
    await table.applyServerRows([
      serverRow({ id: 'reg-1', registered_name: 'Old', breed: 'Beagle', version: 3 }),
    ]);
    await table.updateRegistration('reg-1', { registered_name: 'Edited Here' });
    setDeviceOnline(true);
  });

  it('merges when the server changed a different field (no timestamp-only conflict)', async () => {
    const row = await syncDownloads({
      registered_name: 'Old',
      breed: 'Basset Hound',
      updated_at: '2024-03-01T00:00:00.000Z',
    });

    expect(row?.syncStatus).not.toBe('conflict');
    expect(row?.conflict).toBeUndefined();
    expect(row?.data).toMatchObject({ registeredName: 'Edited Here', breed: 'Basset Hound' });
    expect(row?.serverVersion).toBe(4);
  });

  it('still surfaces a change to the same field', async () => {
    const row = await syncDownloads({
      registered_name: 'Changed Elsewhere',
      updated_at: '2024-03-01T00:00:00.000Z',
    });

    expect(row?.syncStatus).toBe('conflict');
    expect(row?.conflict?.fields).toEqual(['registeredName']);
  });
});

describe('editing an add the server has not acknowledged', () => {
  const inserts = () => queue.sent.filter(([op]) => op === 'insert');

  it('replaces its queued INSERT; the corrected number uploads', async () => {
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'TYPO1' });

    await table.updateRegistration(added.id, { registration_number: 'FIXED1' });

    const pending = await queue.pending();
    expect(pending.map(m => m.operation)).toEqual(['INSERT']);
    expect(pending[0]!.data).toMatchObject({ id: added.id, registration_number: 'FIXED1' });
    setDeviceOnline(true);
    await queue.upload();
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]![2]).toMatchObject({ registration_number: 'FIXED1' });
    expect(queue.sent.filter(([op]) => op === 'update')).toEqual([]);
  });

  it('replaces a refused INSERT; the corrected number uploads', async () => {
    setDeviceOnline(true);
    queue.answer.insert = {
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "dog_registrations_live_org_number_unique"',
      },
    };
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'TAKEN1' });
    await queue.upload();
    expect(await queue.failed()).toHaveLength(1);

    setDeviceOnline(false);
    await table.updateRegistration(added.id, { registration_number: 'FREE1' });

    expect(await queue.failed()).toEqual([]);
    const pending = await queue.pending();
    expect(pending.map(m => m.operation)).toEqual(['INSERT']);
    expect(await table.getReplicatedRow(added.id)).toMatchObject({
      data: { registrationNumber: 'FREE1' },
    });
    delete queue.answer.insert;
    setDeviceOnline(true);
    await queue.upload();
    expect(inserts().map(([, , payload]) => payload)).toEqual([
      expect.objectContaining({ registration_number: 'TAKEN1' }),
      expect.objectContaining({ registration_number: 'FREE1' }),
    ]);
    expect(queue.sent.filter(([op]) => op === 'update')).toEqual([]);
  });

  it('keeps waiting for its dog when the dog was created offline', async () => {
    await replicatedDogsTable.createDogWithId({
      id: 'dog-new',
      name: 'Scout',
      callName: 'Scout',
      breed: 'Beagle',
      ownerId: 'owner-1',
    });
    const dogCreate = replicatedDogsTable.lastMutationId;
    const added = await table.addRegistration({ dog_id: 'dog-new', registration_number: 'N1' });

    await table.updateRegistration(added.id, { registration_number: 'N2' });

    const insert = (await queue.pending()).find(m => m.rowId === added.id);
    expect(insert).toMatchObject({ operation: 'INSERT', dependsOn: [dogCreate] });
    expect(insert!.data).toMatchObject({ registration_number: 'N2' });
  });
});
