/**
 * The Manage registrations panel offline (MYK9-1090, MYK9-1075): Add and
 * Delete each queue their write and make no PostgREST write, and the list
 * shows the result at once; Edit is online-only and is refused.
 * The real panel, dialogs, hooks, table and MutationManager; only the network
 * is faked (LESSON last-hop-drop: nothing between the form and the queue is
 * mocked).
 */
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { configureConflictSurfacing, databaseManager, NOTIFY_DEBOUNCE_MS } from '@myk9/replication';
import { render } from '@/test/utils/testUtils';
import { supabase } from '@/services/database/supabaseClient';
import type { Dog } from '@/types/dog-types';
import { useRegistrationsStore } from '@/store/registrationsStore';
import { useRegistrationsReplicaCacheSync } from '@/providers/useRegistrationsReplicaCacheSync';
import { replicatedDogRegistrationsTable } from '@/services/replication/ReplicatedDogRegistrationsTable';
import { serverRow } from '@/services/replication/__tests__/dogRegistrationFixtures';
import {
  createRegistrationQueueHarness,
  setDeviceOnline,
  type RegistrationQueueHarness,
} from '@/services/replication/__tests__/registrationQueueHarness';
import ManageRegistrationsPanel from './ManageRegistrationsPanel';

const notified = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/notifications', () => ({
  notifications: {
    error: notified.error,
    success: notified.success,
    warning: vi.fn(),
    info: vi.fn(),
  },
}));
import DogRegistrationDialogs from './DogRegistrationDialogs';

const plainDog = { id: 'dog-1', callName: 'Maple' } as unknown as Dog;
/** A dog record that is never refetched, still listing the registration the replica holds. */
const dogRecordSnapshot = {
  ...plainDog,
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      registrationNumber: 'SR12345601',
      registeredName: 'CH Old Name',
    },
  ],
} as unknown as Dog;

/** Every PostgREST method the app client was asked for. */
let postgrestMethods: string[];

/** The app client cannot reach the server: every read fails as offline, every write is recorded. */
function postgrestUnreachable() {
  postgrestMethods = [];
  const offline = Promise.resolve({ data: null, error: new Error('Failed to fetch') });
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'insert', 'update', 'delete', 'upsert']) {
    builder[method] = () => {
      postgrestMethods.push(method);
      return builder;
    };
  }
  builder.in = () => offline;
  builder.order = () => offline;
  builder.single = () => offline;
  vi.mocked(supabase.from).mockImplementation((() => builder) as unknown as typeof supabase.from);
}

/** Mounts the replica refresh listener, as ReplicationSyncProvider does. */
function RefreshListener() {
  useRegistrationsReplicaCacheSync();
  return null;
}

/**
 * `listener: false` leaves out the replica refresh, so whatever the screen
 * shows comes from the delete itself, never from a refetch (MYK9-1143).
 */
function Harness({ listener = true, dog = plainDog }: { listener?: boolean; dog?: Dog }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      {listener && <RefreshListener />}
      <ManageRegistrationsPanel open={open} onClose={() => setOpen(false)} dog={dog} />
      <DogRegistrationDialogs dog={dog} managePanelOpen={open} />
    </>
  );
}

let queue: RegistrationQueueHarness;

beforeEach(async () => {
  await databaseManager.reset();
  configureConflictSurfacing(true);
  queue = createRegistrationQueueHarness();
  notified.success.mockClear();
  await replicatedDogRegistrationsTable.applyServerRows([
    serverRow({ id: 'reg-1', registered_name: 'CH Old Name', organization: 'AKC', version: 3 }),
  ]);
  postgrestUnreachable();
  setDeviceOnline(false);
});

afterEach(async () => {
  act(() => {
    useRegistrationsStore.setState({
      isAddRegistrationDialogOpen: false,
      isEditRegistrationDialogOpen: false,
      isDeleteRegistrationDialogOpen: false,
      selectedRegistration: null,
    });
  });
  await new Promise(resolve => setTimeout(resolve, NOTIFY_DEBOUNCE_MS + 50));
  setDeviceOnline(true);
  await queue.destroy();
  configureConflictSurfacing(false);
  await databaseManager.reset();
});

/** The queue once it holds one mutation: the row shows its new state before the write is queued. */
async function queuedOnce() {
  await waitFor(async () => expect(await queue.pending()).toHaveLength(1));
  return queue.pending();
}

/** Kebab, Delete, then the confirm dialog's Delete. */
async function confirmDelete(user: ReturnType<typeof render>['user']) {
  await user.click(screen.getByRole('button', { name: /more actions/i }));
  await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
  const confirm = await screen.findByRole('dialog', { name: /delete registration/i });
  expect(confirm).toHaveTextContent('CH Old Name');
  await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));
}

const noPostgrestWrites = () =>
  expect(postgrestMethods.filter(m => m !== 'select' && m !== 'eq')).toEqual([]);

describe('Manage registrations, offline', () => {
  it('Add queues an INSERT and shows the new registration', async () => {
    const { user } = render(<Harness />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.selectOptions(
      await screen.findByLabelText(/^organization/i),
      'AKC (American Kennel Club)'
    );
    await user.type(screen.getByLabelText(/registered name/i), 'CH New Dog');
    await user.selectOptions(screen.getByLabelText(/^breed/i), 'Beagle');
    await user.type(screen.getByLabelText(/registration number/i), 'SR999');
    await user.click(screen.getByRole('button', { name: 'Add Registration' }));

    expect(await screen.findByText('CH New Dog')).toBeInTheDocument();
    const [insert, ...rest] = await queuedOnce();
    expect(rest).toEqual([]);
    expect(insert).toMatchObject({
      operation: 'INSERT',
      tableName: 'dog_registrations',
      data: {
        dog_id: 'dog-1',
        registered_name: 'CH New Dog',
        breed: 'Beagle',
        registration_number: 'SR999',
      },
    });
    noPostgrestWrites();
  });

  // Registration edits are online-only (MYK9-1090): offline the save is
  // refused before anything is written, and the form stays open.
  it('Edit is refused offline: nothing written or queued, and the form keeps the edit', async () => {
    const { user } = render(<Harness />);
    await user.click(
      await screen.findByRole('button', { name: /edit akc registered name for ch old name/i })
    );
    await user.type(await screen.findByDisplayValue('CH Old Name'), ' II');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() =>
      expect(JSON.stringify(notified.error.mock.calls)).toMatch(
        /Reconnect to save registration changes/
      )
    );
    expect(screen.getByDisplayValue('CH Old Name II')).toBeInTheDocument();
    expect(await queue.pending()).toEqual([]);
    expect(await replicatedDogRegistrationsTable.get('reg-1')).toMatchObject({
      registeredName: 'CH Old Name',
    });
    noPostgrestWrites();
  });

  it('Delete queues a DELETE of that row and hides it', async () => {
    const { user } = render(<Harness />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await confirmDelete(user);

    await waitFor(() => expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument());
    const [deletion, ...rest] = await queuedOnce();
    expect(rest).toEqual([]);
    expect(deletion).toMatchObject({ operation: 'DELETE', rowId: 'reg-1' });
    noPostgrestWrites();
  });

  // The dog-record fallback is for a device that holds nothing for the dog,
  // never for one a delete just emptied: the deleted card must stay gone.
  it('Delete of the only registration stays deleted though the dog record still lists it', async () => {
    // The emptied device copy is read again by the coalesced refresh (the
    // pending delete is held as unsent work): that read is the event to wait for.
    const held = vi.spyOn(replicatedDogRegistrationsTable, 'getUnsentWorkForDogs');
    const { user } = render(<Harness dog={dogRecordSnapshot} />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await confirmDelete(user);

    await waitFor(() => expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument());
    await queuedOnce();
    await waitFor(async () => {
      const reads = await Promise.all(held.mock.results.map(result => result.value));
      expect(reads.some(rows => rows.length > 0)).toBe(true);
    });
    expect(await screen.findByText('No registrations saved on this device')).toBeInTheDocument();
    expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument();
    held.mockRestore();
  });

  // MYK9-1143: offline the row went only when the replica listener's refetch
  // landed, seconds later, with nothing said. With the listener left out, only
  // the delete itself can take the row away.
  it('Delete takes the row away at once, without a refetch, and says it saved on this device', async () => {
    const { user } = render(<Harness listener={false} />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await confirmDelete(user);

    await waitFor(() => expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument(), {
      timeout: 300,
    });
    await waitFor(() =>
      expect(notified.success).toHaveBeenCalledWith(
        "Registration deleted on this device — it will sync when you're back online"
      )
    );
    const [deletion] = await queuedOnce();
    expect(deletion).toMatchObject({ operation: 'DELETE', rowId: 'reg-1' });
    noPostgrestWrites();
  });

  // MYK9-1075 unchanged: the row taken away at once still comes back when a
  // refused delete is discarded.
  it('a refused delete, discarded, puts the row back on screen', async () => {
    const { user } = render(<Harness />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await confirmDelete(user);
    await waitFor(() => expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument());
    await queuedOnce();

    setDeviceOnline(true);
    queue.answer.delete = { data: null, error: { code: '42501', message: 'permission denied' } };
    await queue.upload();
    const [failed] = await queue.failed();
    expect(failed).toMatchObject({ operation: 'DELETE', rowId: 'reg-1' });

    setDeviceOnline(false);
    await act(() => queue.manager.discardFailedMutation(failed!.id));

    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();
  });
});
