/**
 * Codex review of PR 3a (MYK9-1090):
 *
 * 1. An edit and a server change to DIFFERENT fields merge: `updatedAt`, which
 *    both sides stamp, is bookkeeping, not a collision. A same-field change
 *    still surfaces.
 * 2. Editing an add (Codex round 2): a queued add's edit is an UPDATE that
 *    waits for the INSERT and carries the OCC token every new registration
 *    starts with (1), so a lost INSERT response or another device's change
 *    can never be overwritten silently. An add the server refused cannot be
 *    edited: discard it and add it again.
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
    // The device stays offline, so the edit is still queued when the sync
    // (whose reads the fake server answers) brings the server's change.
    await table.updateRegistration('reg-1', { registered_name: 'Edited Here' });
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

describe('editing an add', () => {
  const REFUSED = "This registration couldn't be added. Discard it and add it again.";

  it('queued: an UPDATE that waits for its INSERT and carries the token 1', async () => {
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'TYPO1' });

    await table.updateRegistration(added.id, { registration_number: 'FIXED1' });

    const pending = await queue.pending();
    expect(pending).toHaveLength(2);
    const insert = pending.find(m => m.operation === 'INSERT');
    const update = pending.find(m => m.operation === 'UPDATE');
    expect(insert).toMatchObject({ rowId: added.id });
    expect(update).toMatchObject({
      operation: 'UPDATE',
      rowId: added.id,
      serverVersion: 1,
      dependsOn: [insert!.id],
      data: { registration_number: 'FIXED1' },
    });
  });

  it('queued on a dog created offline: the UPDATE also waits for the dog', async () => {
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

    const pending = await queue.pending();
    const insert = pending.find(m => m.rowId === added.id && m.operation === 'INSERT');
    const update = pending.find(m => m.rowId === added.id && m.operation === 'UPDATE');
    expect(update!.dependsOn).toEqual(expect.arrayContaining([insert!.id, dogCreate]));
  });

  // The INSERT committed but its response was lost: the server already holds
  // the row. The replay is a primary-key duplicate (success), then the UPDATE
  // lands at version 1 and the correction is what the server ends with.
  it('after a lost INSERT response, the correction still reaches the server', async () => {
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'TYPO1' });
    await table.updateRegistration(added.id, { registration_number: 'FIXED1' });
    queue.server.set(added.id, { id: added.id, registration_number: 'TYPO1', version: 1 });

    setDeviceOnline(true);
    await queue.upload();

    expect(await queue.pending()).toEqual([]);
    expect(await queue.failed()).toEqual([]);
    expect(queue.filters).toEqual([{ op: 'update', eqs: { id: added.id, version: 1 } }]);
    expect(queue.server.get(added.id)).toMatchObject({
      registration_number: 'FIXED1',
      version: 2,
    });
  });

  it('refused by the server: the edit is refused and nothing is queued', async () => {
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

    await expect(
      table.updateRegistration(added.id, { registration_number: 'FREE1' })
    ).rejects.toThrow(REFUSED);

    expect(await queue.pending()).toEqual([]);
    expect(await queue.failed()).toHaveLength(1);
    expect(await table.get(added.id)).toMatchObject({ registrationNumber: 'TAKEN1' });
  });

  // Uploaded but not yet downloaded: the INSERT's acknowledgement carries no
  // version, so the add must already hold its token, or the edit would be an
  // UPDATE with no precondition.
  it('uploaded but not downloaded: the edit carries the token 1', async () => {
    setDeviceOnline(true);
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'UP1' });
    await queue.upload();
    expect(await table.getReplicatedRow(added.id)).toMatchObject({ isDirty: false });
    setDeviceOnline(false);

    await table.updateRegistration(added.id, { registered_name: 'Edited' });

    const [update] = await queue.pending();
    expect(update).toMatchObject({ operation: 'UPDATE', rowId: added.id, serverVersion: 1 });
  });
});
