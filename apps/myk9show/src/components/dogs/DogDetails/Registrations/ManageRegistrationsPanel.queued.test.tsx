/**
 * The Manage registrations panel saves through the registrations queue
 * (MYK9-1090, MYK9-1075): offline, Add, Edit and Delete each queue their
 * write and make no PostgREST write, and the list shows the result at once.
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
import DogRegistrationDialogs from './DogRegistrationDialogs';

const dog = { id: 'dog-1', callName: 'Maple' } as unknown as Dog;

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

function Harness() {
  const [open, setOpen] = useState(true);
  useRegistrationsReplicaCacheSync();
  return (
    <>
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

  it('Edit queues an UPDATE of the row and shows the edit', async () => {
    const { user } = render(<Harness />);
    await user.click(
      await screen.findByRole('button', { name: /edit akc registered name for ch old name/i })
    );
    await user.type(await screen.findByDisplayValue('CH Old Name'), ' II');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(await screen.findByText('CH Old Name II')).toBeInTheDocument();
    const [update, ...rest] = await queuedOnce();
    expect(rest).toEqual([]);
    expect(update).toMatchObject({
      operation: 'UPDATE',
      rowId: 'reg-1',
      serverVersion: 3,
      data: { registered_name: 'CH Old Name II' },
    });
    noPostgrestWrites();
  });

  it('Delete queues a DELETE of that row and hides it', async () => {
    const { user } = render(<Harness />);
    expect(await screen.findByText('CH Old Name')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /more actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: /delete/i }));
    const confirm = await screen.findByRole('dialog', { name: /delete registration/i });
    expect(confirm).toHaveTextContent('CH Old Name');
    await user.click(within(confirm).getByRole('button', { name: /^delete$/i }));

    await waitFor(() => expect(screen.queryByText('CH Old Name')).not.toBeInTheDocument());
    const [deletion, ...rest] = await queuedOnce();
    expect(rest).toEqual([]);
    expect(deletion).toMatchObject({ operation: 'DELETE', rowId: 'reg-1' });
    noPostgrestWrites();
  });
});
