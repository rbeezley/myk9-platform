/**
 * MYK9-1076: when the server permanently refuses a queued dog edit, or the user
 * discards the failed edit, the device must show the server's dog again. The
 * replica used to keep the refused value, and incremental sync never re-fetches
 * a row whose server version did not change.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { databaseManager, MutationManager } from '@myk9/replication';
import { supabase } from '@/services/database/supabaseClient';
import { ReplicatedDogsTable, type ReplicatedDog } from './ReplicatedDogsTable';

vi.mock('@myk9/core', () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const AUTH_USER = 'auth-user-1076';
const DOG_ID = 'dog-1076';

const seed = { id: DOG_ID, name: 'Rex', callName: 'Rex', breed: 'Beagle' } as ReplicatedDog;

const serverDog = {
  id: DOG_ID,
  name: 'Rex',
  call_name: 'Rex',
  breed: 'Beagle',
  version: 4,
  updated_at: '2026-10-08T01:54:59.031578+00:00',
};

/** The upload client: the server refuses every dog UPDATE (RLS denial, permanent). */
function refusingUploadClient(): SupabaseClient {
  const builder: Record<string, unknown> = {};
  builder.update = () => builder;
  builder.eq = () => builder;
  builder.select = async () => ({
    data: null,
    error: { code: '42501', message: 'new row violates row-level security policy' },
  });
  return { from: () => builder } as unknown as SupabaseClient;
}

/** The app client the by-id re-read uses: a thenable chain yielding `rows`. */
function mockServerRows(rows: Record<string, unknown>[]) {
  const chain: Record<string, unknown> = {};
  for (const step of ['select', 'in', 'eq', 'gt', 'order']) chain[step] = vi.fn(() => chain);
  chain.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  vi.mocked(supabase.from).mockReturnValue(chain as never);
}

describe('a discarded failed dog edit is replaced by the server row (MYK9-1076)', () => {
  let table: ReplicatedDogsTable;
  let manager: MutationManager;

  beforeEach(async () => {
    await databaseManager.reset();
    vi.mocked(supabase.from).mockReset();
    table = new ReplicatedDogsTable();
    await table.clearCache();
    await table.set(DOG_ID, seed, false, undefined, 3);
    const upload = refusingUploadClient();
    manager = new MutationManager(upload, {
      maxRetries: 1,
      retryBackoffBase: 60_000,
      getCurrentUserId: async () => AUTH_USER,
      getCurrentUploadContext: async () => ({ authUserId: AUTH_USER, supabaseClient: upload }),
    });
    table.setMutationManager(manager);
  });

  afterEach(async () => {
    manager.destroy();
    await databaseManager.reset();
  });

  it("keeps showing the user's edit after the server permanently refuses it (until Retry or Discard)", async () => {
    mockServerRows([serverDog]);
    await table.updateDog(DOG_ID, { breed: 'Poodle' });

    await manager.uploadPendingMutations();
    await Promise.resolve();

    expect(await manager.getFailedMutations()).toHaveLength(1);
    expect((await table.get(DOG_ID))?.breed).toBe('Poodle');
    expect(vi.mocked(supabase.from)).not.toHaveBeenCalledWith('dogs');
  });

  it('shows the server value after the user discards the failed edit', async () => {
    await table.updateDog(DOG_ID, { breed: 'Poodle' });
    await manager.uploadPendingMutations();
    const [failed] = await manager.getFailedMutations();
    expect((await table.get(DOG_ID))?.breed).toBe('Poodle');

    mockServerRows([serverDog]);
    await manager.discardFailedMutation(failed!.id);

    await vi.waitFor(async () => expect((await table.get(DOG_ID))?.breed).toBe('Beagle'));
    const row = await table.getReplicatedRow(DOG_ID);
    expect(row?.isDirty).toBe(false);
    expect(row?.serverVersion).toBe(4);
  });

  it('keeps the edit and the queue intact when the device is offline at discard', async () => {
    await table.updateDog(DOG_ID, { breed: 'Poodle' });
    await manager.uploadPendingMutations();
    const [failed] = await manager.getFailedMutations();
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new TypeError('Failed to fetch');
    });

    await expect(manager.discardFailedMutation(failed!.id)).resolves.toBeUndefined();

    expect(await manager.getFailedMutations()).toHaveLength(0);
    expect((await table.get(DOG_ID))?.breed).toBe('Poodle');
  });
});
