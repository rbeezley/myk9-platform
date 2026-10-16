/**
 * The end of a queued add's life (Codex on the narrowed PR 3a):
 *
 * 1. An add the server already holds (a server read proved it after a lost
 *    acknowledgement) whose INSERT is then refused and discarded comes back
 *    clean, as the server has it, instead of staying dirty for good.
 * 2. Discarding a refused add that only this device held removes the row and
 *    tells the table's subscribers, so the screens refresh.
 * 3. An acknowledged add is an ordinary server-backed row: both add flags go,
 *    and an online edit of it is allowed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { assertRegistrationEditable } from '@/services/database/registrations/editGuard';
import { unsentWorkProvenByServer } from '@/services/database/registrations/unsentWork';
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

const REFUSED = { data: null, error: { code: '42501', message: 'permission denied' } };

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  setDeviceOnline(true);
});

afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

describe('a server-backed add whose INSERT is refused and discarded', () => {
  async function provenAddThenRefusedInsert() {
    setDeviceOnline(false);
    const added = await table.addRegistration({
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'X1',
      registered_name: 'Committed',
    });
    // The INSERT committed; its acknowledgement was lost. A server read
    // proves the add landed.
    const onServer = serverRow({
      id: added.id,
      organization: 'AKC',
      registration_number: 'X1',
      registered_name: 'Committed',
      version: 1,
    });
    await unsentWorkProvenByServer(['dog-1'], [onServer]);
    // The replay is refused for good.
    setDeviceOnline(true);
    queue.answer.insert = REFUSED;
    await queue.upload();
    const [failed] = await queue.failed();
    expect(failed).toMatchObject({ operation: 'INSERT', rowId: added.id });
    return { added, onServer, failed: failed! };
  }

  it('offline Discard puts the row back clean', async () => {
    const { added, failed } = await provenAddThenRefusedInsert();
    setDeviceOnline(false);

    await queue.manager.discardFailedMutation(failed.id);

    expect(await table.getReplicatedRow(added.id)).toMatchObject({
      isDirty: false,
      data: { registeredName: 'Committed' },
    });
  });

  it('online Discard adopts the server copy', async () => {
    const { added, onServer, failed } = await provenAddThenRefusedInsert();
    installRegistrationsServer(
      newServer({ rows: [{ ...onServer, registered_name: 'Server Name', version: 2 }] })
    );

    await queue.manager.discardFailedMutation(failed.id);

    await vi.waitFor(async () =>
      expect(await table.getReplicatedRow(added.id)).toMatchObject({
        isDirty: false,
        serverVersion: 2,
        data: { registeredName: 'Server Name' },
      })
    );
  });
});

describe('a refused add only this device held', () => {
  it('Discard removes it and tells the table subscribers', async () => {
    queue.answer.insert = REFUSED;
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'Y1' });
    await queue.upload();
    const [failed] = await queue.failed();
    await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
    const heard = vi.fn();
    const unsubscribe = table.subscribe(heard, { emitCurrent: false });

    await queue.manager.discardFailedMutation(failed!.id);

    expect(await table.getReplicatedRow(added.id)).toBeNull();
    await vi.waitFor(() => expect(heard).toHaveBeenCalled());
    unsubscribe();
  });
});

describe('an acknowledged add', () => {
  it('is an ordinary server-backed row, and an online edit is allowed', async () => {
    const added = await table.addRegistration({ dog_id: 'dog-1', registration_number: 'Z1' });
    await queue.upload();

    const row = await table.getReplicatedRow(added.id);
    expect(row?.data._localOnly).toBeUndefined();
    expect(row?.data._queuedAdd).toBeUndefined();
    await expect(assertRegistrationEditable(added.id)).resolves.toBeUndefined();
  });

  // The queue is the authority on unsent work: a leftover add flag on a clean
  // row with nothing queued does not block an edit.
  it('a leftover add flag on a clean row with nothing queued does not block an edit', async () => {
    await table.applyServerRows([serverRow({ id: 'reg-old' })]);
    const row = await table.get('reg-old');
    await table.set('reg-old', { ...row!, _queuedAdd: true }, false);

    await expect(assertRegistrationEditable('reg-old')).resolves.toBeUndefined();
  });
});
