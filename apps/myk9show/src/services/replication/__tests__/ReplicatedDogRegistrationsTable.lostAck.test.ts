/**
 * An add whose INSERT committed but whose acknowledgement was lost (Codex
 * round 3). The server holds the row; the device still has it as an unsent
 * add with its INSERT queued. A server row with the add's id proves the add
 * landed, so the device row becomes an ordinary server-backed row: the
 * readers show its unsent edit over the server copy, and edit and delete take
 * the normal path. The queued INSERT replays as a primary-key duplicate.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { replicatedDogRegistrationsTable as table } from '../ReplicatedDogRegistrationsTable';
import { mergeUnsentWork } from '../dogRegistrationMerge';
import { unsentWorkProvenByServer } from '@/services/database/registrations/unsentWork';
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

/**
 * Add a registration, then let its INSERT commit on the server without the
 * device hearing back: the server holds the row; the device's INSERT is
 * still queued.
 */
async function addWhoseAckWasLost() {
  const added = await table.addRegistration({
    dog_id: 'dog-1',
    organization: 'AKC',
    registration_number: 'TYPO1',
    registered_name: 'Lost Ack',
  });
  const committed = serverRow({
    id: added.id,
    dog_id: 'dog-1',
    organization: 'AKC',
    registration_number: 'TYPO1',
    registered_name: 'Lost Ack',
    created_at: added.createdAt,
    updated_at: '2030-01-01T00:00:00.000Z',
    version: 1,
  });
  queue.server.set(added.id, { ...committed });
  return { added, committed };
}

/**
 * A sync that sees the committed row: through the changes pass, the ID pass,
 * or (default) both.
 */
async function syncSees(
  committed: ReturnType<typeof serverRow>,
  passes: 'both' | 'changes' | 'ids' = 'both'
) {
  installRegistrationsServer(
    newServer({
      changePages: [passes === 'ids' ? [] : [committed]],
      // A failed id page skips the ID pass.
      idPages: [passes === 'changes' ? new Error('timeout') : [{ id: committed.id }]],
    })
  );
  await table.sync();
}

describe('an add whose INSERT committed but whose acknowledgement was lost', () => {
  it('becomes a server-backed row once a sync sees the server row', async () => {
    const { added, committed } = await addWhoseAckWasLost();

    await syncSees(committed);

    const row = await table.getReplicatedRow(added.id);
    expect(row?.data._localOnly).toBeUndefined();
    expect(row?.data._queuedAdd).toBeUndefined();
    expect(row?.serverVersion).toBe(1);
  });

  it.each(['changes', 'ids'] as const)(
    'is marked server-backed by the %s pass alone',
    async passes => {
      const { added, committed } = await addWhoseAckWasLost();

      await syncSees(committed, passes);

      const row = await table.getReplicatedRow(added.id);
      expect(row?.data._localOnly).toBeUndefined();
      expect(row?.data._queuedAdd).toBeUndefined();
    }
  );

  it('after the sync: the edit shows over the server copy and is what the server ends with', async () => {
    const { added, committed } = await addWhoseAckWasLost();
    await syncSees(committed);

    await table.updateRegistration(added.id, { registration_number: 'FIXED1' });

    const unsent = await table.getUnsentWorkForDogs(['dog-1']);
    expect(mergeUnsentWork([committed], unsent)).toEqual([
      expect.objectContaining({ id: added.id, registration_number: 'FIXED1' }),
    ]);
    setDeviceOnline(true);
    await queue.upload();
    expect(await queue.failed()).toEqual([]);
    expect(queue.server.get(added.id)).toMatchObject({ registration_number: 'FIXED1' });
  });

  it('after the sync: delete removes it from the server and the device', async () => {
    const { added, committed } = await addWhoseAckWasLost();
    await syncSees(committed);

    await table.deleteRegistration(added.id);
    // The DELETE waits for the INSERT, which replays as a duplicate: never
    // the other way round, which would delete then re-create the row.
    const pending = await queue.pending();
    const insert = pending.find(m => m.operation === 'INSERT');
    expect(pending.find(m => m.operation === 'DELETE')?.dependsOn).toContain(insert!.id);
    setDeviceOnline(true);
    await queue.upload();

    expect(await queue.failed()).toEqual([]);
    expect(queue.server.has(added.id)).toBe(false);
    expect(await table.getReplicatedRow(added.id)).toBeNull();
  });

  // A server read proves it too: the row is marked before the merge, so a
  // delete straight after takes the normal path instead of cancelling an
  // INSERT the server already applied.
  it('before a sync: a server read marks it server-backed', async () => {
    const { added, committed } = await addWhoseAckWasLost();

    await unsentWorkProvenByServer(['dog-1'], [committed]);

    const row = await table.getReplicatedRow(added.id);
    expect(row?.data._localOnly).toBeUndefined();
    expect(row?.data._queuedAdd).toBeUndefined();
    expect(row?.serverVersion).toBe(1);
  });

  // Before any sync: the server read already shows the row. The device's
  // queued edit of it must win, like every unsent edit.
  it('before a sync: a server read shows the unsent edit, not the server copy', async () => {
    const { added, committed } = await addWhoseAckWasLost();
    await table.updateRegistration(added.id, { registration_number: 'FIXED1' });

    const unsent = await table.getUnsentWorkForDogs(['dog-1']);

    expect(mergeUnsentWork([committed], unsent)).toEqual([
      expect.objectContaining({ id: added.id, registration_number: 'FIXED1' }),
    ]);
  });
});
