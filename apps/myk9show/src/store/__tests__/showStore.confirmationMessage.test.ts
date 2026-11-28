/**
 * MYK9-2114: the note to exhibitors must reach the queued PATCH of shows.confirmation_message
 * through the whole save path: edit form -> changedShowSaveData -> showStore.updateShow ->
 * showUpdateFields -> ReplicatedShowsTable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/config/dataSource', () => ({ shouldUseMockData: () => false }));

import { MutationManager } from '@myk9/replication';
import type { SupabaseClient } from '@supabase/supabase-js';
import { replicatedShowsTable } from '@/services/replication';
import { useShowStore } from '../showStore';
import { spyOnWriteAndQueue } from '@/test/utils/spyOnWriteAndQueue';
import {
  changedShowSaveData,
  showToFormData,
} from '@/components/panels/edit/ShowEditPanel.helpers';
import type { ReplicatedShow } from '@/services/replication/replicatedShowTypes';
import type { StoreShow } from '@/types/show-types';

const SHOW: ReplicatedShow = {
  id: 'show-1',
  name: 'Fall Trial',
  organization: 'AKC',
  startDate: '2026-11-07T00:00:00+00:00',
  endDate: '2026-11-08T00:00:00+00:00',
};

describe('Edit show save carries the note to exhibitors (MYK9-2114)', () => {
  let queue: ReturnType<typeof spyOnWriteAndQueue>['queue'];

  beforeEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
    queue = spyOnWriteAndQueue(replicatedShowsTable).queue;
    queue.mockResolvedValue('mutation-1');
  });

  afterEach(async () => {
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  async function saveNote(heldNote: string | undefined, typed: string) {
    await replicatedShowsTable.set(SHOW.id, {
      ...SHOW,
      ...(heldNote !== undefined && { confirmationMessage: heldNote }),
    });
    const opened = showToFormData({
      ...SHOW,
      ...(heldNote !== undefined && { confirmationMessage: heldNote }),
    } as unknown as StoreShow);
    const changes = changedShowSaveData(opened, { ...opened, confirmationMessage: typed });
    useShowStore.setState({
      shows: [
        {
          ...SHOW,
          ...(heldNote !== undefined && { confirmationMessage: heldNote }),
        } as unknown as StoreShow,
      ],
      error: null,
      isLoading: false,
    });
    await useShowStore.getState().updateShow(SHOW.id, changes as never);
    return queue.mock.calls.at(-1)?.[2] as Record<string, unknown>;
  }

  it('sends the typed note to confirmation_message', async () => {
    const payload = await saveNote(undefined, '  Park in the north lot.  ');
    expect(payload).toMatchObject({ id: SHOW.id, confirmation_message: 'Park in the north lot.' });
  });

  it('sends null when the box is emptied', async () => {
    const payload = await saveNote('Park in the north lot.', '');
    expect(payload).toHaveProperty('confirmation_message', null);
  });
});

describe('Edit show save uploads the note through the real queue (MYK9-2114)', () => {
  let manager: MutationManager | undefined;

  afterEach(async () => {
    await manager?.clearAllMutations();
    manager?.destroy();
    const { databaseManager } = await import('@myk9/replication');
    await databaseManager.reset();
  });

  it('the PATCH body carries confirmation_message', async () => {
    const bodies: Record<string, unknown>[] = [];
    const client = {
      from: vi.fn(() => ({
        update: (payload: Record<string, unknown>) => {
          bodies.push(payload);
          const chain = {
            eq: () => chain,
            select: () => Promise.resolve({ data: [{ id: SHOW.id, version: 2 }], error: null }),
          };
          return chain;
        },
      })),
    } as unknown as SupabaseClient;
    manager = new MutationManager(client, {
      maxRetries: 1,
      retryBackoffBase: 1,
      getCurrentUserId: async () => 'auth-user-1',
      getCurrentUploadContext: async () => ({
        authUserId: 'auth-user-1',
        supabaseClient: client,
      }),
    });
    replicatedShowsTable.setMutationManager(manager);
    await replicatedShowsTable.set(SHOW.id, SHOW, false);
    const opened = showToFormData(SHOW as unknown as StoreShow);
    const changes = changedShowSaveData(opened, { ...opened, confirmationMessage: 'Park north.' });
    useShowStore.setState({ shows: [SHOW as unknown as StoreShow], error: null, isLoading: false });

    await useShowStore.getState().updateShow(SHOW.id, changes as never);
    await manager.uploadPendingMutations();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ confirmation_message: 'Park north.' });
  });
});
