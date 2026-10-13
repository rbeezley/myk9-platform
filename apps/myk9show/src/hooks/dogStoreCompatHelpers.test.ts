/**
 * Edit dog's registration fields (MYK9-1090). Registration EDITS are
 * online-only: an edit goes straight to the server, and an add is queued.
 * When the server cannot be read, any registration change is refused before
 * anything is written; the dog's own fields are saved by the caller either way.
 * Fields the form did not change are not a change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureConflictSurfacing, databaseManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { REGISTRATION_CHANGES_NEED_CONNECTION } from '@/services/replication/dogRegistrationWrites';
import { REGISTRATION_STILL_SAVING } from '@/services/database/registrations/editGuard';
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

const direct = vi.hoisted(() => ({ updateRegistration: vi.fn() }));
vi.mock('@/services/database/registrations/reads', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/registrations/reads')>()),
  updateRegistration: direct.updateRegistration,
}));

let queue: RegistrationQueueHarness;

const AKC_ROW = serverRow({
  id: 'reg-akc',
  organization: 'AKC',
  registered_name: 'CH Old Name',
  breed: 'Beagle',
  status: 'Active',
  version: 5,
});
const AKC_EDIT = {
  organization: 'AKC',
  registeredName: 'CH New Name',
  type: 'Beagle',
  status: 'Active',
};
const AKC_SAME = {
  organization: 'AKC',
  registeredName: 'CH Old Name',
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

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  direct.updateRegistration.mockReset();
  direct.updateRegistration.mockResolvedValue({ data: { id: 'reg-akc' }, error: null });
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

  it('edits a matching organization straight on the server, with only what changed', async () => {
    installRegistrationsServer(newServer({ rows: [AKC_ROW] }));

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).resolves.toBe(true);

    expect(direct.updateRegistration).toHaveBeenCalledWith('reg-akc', {
      registered_name: 'CH New Name',
    });
    expect((await queue.pending()).filter(m => m.operation === 'UPDATE')).toEqual([]);
  });

  it('adds a new organization through the queue', async () => {
    installRegistrationsServer(newServer({ rows: [AKC_ROW] }));

    await expect(syncDogRegistrations('dog-1', [AKC_SAME, UKC_NEW])).resolves.toBe(true);

    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect((await queue.pending()).find(m => m.operation === 'INSERT')).toMatchObject({
      data: { dog_id: 'dog-1', organization: 'UKC', registration_number: 'P77' },
    });
  });

  it('adds when the server has no row, even with a stale cached copy on the device', async () => {
    // Deleted on another device; this device still holds the clean copy.
    await replicatedDogRegistrationsTable.applyServerRows([AKC_ROW]);
    installRegistrationsServer(newServer({ rows: [] }));

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).resolves.toBe(true);

    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect((await queue.pending()).map(m => m.operation)).toEqual(['INSERT']);
  });

  it('refuses an edit of a registration whose add has not been confirmed', async () => {
    setDeviceOnline(false);
    const added = await replicatedDogRegistrationsTable.addRegistration({
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'NEW1',
      registered_name: 'CH Old Name',
    });
    setDeviceOnline(true);
    installRegistrationsServer(newServer({ rows: [] }));

    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).rejects.toThrow(
      REGISTRATION_STILL_SAVING
    );
    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect((await queue.pending()).map(m => m.rowId)).toEqual([added.id]);
  });
});

describe('syncDogRegistrations, server unreachable', () => {
  beforeEach(async () => {
    serverUnreachable();
    setDeviceOnline(false);
    await replicatedDogRegistrationsTable.applyServerRows([AKC_ROW]);
  });

  it('refuses a registration change, writing and queueing nothing', async () => {
    await expect(syncDogRegistrations('dog-1', [AKC_EDIT])).rejects.toThrow(
      REGISTRATION_CHANGES_NEED_CONNECTION
    );
    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect(await queue.pending()).toEqual([]);
    expect(await replicatedDogRegistrationsTable.get('reg-akc')).toMatchObject({
      registeredName: 'CH Old Name',
    });
  });

  it('refuses a new organization too: absence is never read as "none"', async () => {
    await expect(syncDogRegistrations('dog-1', [AKC_SAME, UKC_NEW])).rejects.toThrow(
      REGISTRATION_CHANGES_NEED_CONNECTION
    );
    expect(await queue.pending()).toEqual([]);
  });

  it('is no change at all when the form leaves the registrations as they are', async () => {
    await expect(syncDogRegistrations('dog-1', [AKC_SAME])).resolves.toBe(false);
    expect(direct.updateRegistration).not.toHaveBeenCalled();
    expect(await queue.pending()).toEqual([]);
  });
});
