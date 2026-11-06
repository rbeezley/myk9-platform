/**
 * MYK9-1721 on the real replica and queue (fake-indexeddb MutationManager plus the singleton
 * shows table): each "This show uses…" switch is owned by its own pending local write. While a
 * queued write sets a uses_* column, a server copy pulled for the row must not put the old value
 * back, on the row or in the rebased write. Every other column stays server-wins.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureConflictSurfacing,
  databaseManager,
  MutationManager,
  REPLICATION_STORES,
  refetchDirtyRowsById,
  type PendingMutation,
} from '@myk9/replication';
import { replicatedShowsTable as table } from './ReplicatedShowsTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ID = 'show-1';
const AUTH = 'switch-owner-user';

type Reply = { data: unknown; error: unknown };

const serverShow = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  name: 'Spring Specialty',
  organization: 'AKC',
  start_date: '2026-12-01',
  end_date: '2026-12-02',
  status: 'draft',
  version: 3,
  uses_device_scoring: true,
  uses_paper_packet: false,
  uses_volunteers: false,
  uses_landing_page: false,
  publishes_own_premium: false,
  ...extra,
});

describe('ReplicatedShowsTable switch ownership (MYK9-1721)', () => {
  let manager: MutationManager;
  let updateImpl: () => Promise<Reply>;

  const supabase = () =>
    ({
      from: () => ({
        update: () => {
          const builder = {
            eq: () => builder,
            select: async () => updateImpl(),
          };
          return builder;
        },
      }),
    }) as unknown as SupabaseClient;

  const row = () => table.getReplicatedRow(ID);
  const pending = (): Promise<PendingMutation[]> => manager.getPendingMutationsForTable('shows');

  /** A pull of the DIRTY row: the server copy is reconciled against the queue. */
  const pull = async (copy: Record<string, unknown>) => {
    const base = (
      table as unknown as { getRowRefetchAdapter(): Parameters<typeof refetchDirtyRowsById>[1] }
    ).getRowRefetchAdapter();
    await refetchDirtyRowsById(
      table as unknown as Parameters<typeof refetchDirtyRowsById>[0],
      { ...base, fetchRowsById: async () => [copy] },
      [ID]
    );
  };

  beforeEach(async () => {
    await databaseManager.reset();
    const db = await databaseManager.getDatabase('test');
    await db.clear(REPLICATION_STORES.PENDING_MUTATIONS);
    await db.clear(REPLICATION_STORES.FAILED_MUTATIONS);
    configureConflictSurfacing(true);
    vi.stubGlobal('window', { dispatchEvent: () => true });
    updateImpl = async () => {
      throw new TypeError('Failed to fetch');
    };
    manager = new MutationManager(supabase(), {
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH,
      getCurrentUploadContext: async () => ({ authUserId: AUTH, supabaseClient: supabase() }),
    });
    table.setMutationManager(manager);
    await table.clearCache();
    const adapter = (
      table as unknown as {
        getRowRefetchAdapter(): {
          toLocalRow(r: unknown): Parameters<typeof table.set>[1];
        };
      }
    ).getRowRefetchAdapter();
    await table.set(ID, adapter.toLocalRow(serverShow()), false, undefined, 3);
  });

  afterEach(async () => {
    manager.destroy();
    vi.unstubAllGlobals();
    await databaseManager.reset();
  });

  it('keeps a switch turned off then on while a stale server copy that has the off lands', async () => {
    await table.updateShow(ID, { usesDeviceScoring: false });
    await table.updateShow(ID, { usesDeviceScoring: true });

    // The server holds the off the first write landed, and a rename from elsewhere.
    await pull(serverShow({ name: 'Renamed', uses_device_scoring: false, version: 4 }));

    const data = (await row())!.data;
    expect(data.usesDeviceScoring).toBe(true);
    expect(data.name).toBe('Renamed');
    const uploads = (await pending()).filter(m => m.operation === 'UPDATE');
    expect(uploads.at(-1)!.data).toMatchObject({ uses_device_scoring: true });
  });

  it('keeps a switch turned on against a server copy that does not have it yet', async () => {
    await table.updateShow(ID, { usesVolunteers: true });

    await pull(serverShow({ name: 'Renamed', uses_volunteers: false, version: 4 }));

    const data = (await row())!.data;
    expect(data.usesVolunteers).toBe(true);
    expect(data.name).toBe('Renamed');
  });

  it('takes a switch from the server once no write of this device is pending for it', async () => {
    await table.updateShow(ID, { usesVolunteers: true });
    updateImpl = async () => ({ data: [{ version: 4 }], error: null });
    const db = await databaseManager.getDatabase('test');
    for (const m of (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[]) {
      await db.put(REPLICATION_STORES.PENDING_MUTATIONS, { ...m, nextRetryAt: 0 });
    }
    await manager.uploadPendingMutations();
    await vi.waitFor(async () => expect(await pending()).toHaveLength(0));

    // Another device turns it off; the row is clean, so the server wins.
    const clean = (await row())!;
    expect(clean.isDirty).toBe(false);
    await table.set(ID, { ...clean.data, usesVolunteers: false }, false, undefined, 5);
    expect((await row())!.data.usesVolunteers).toBe(false);
  });
});
