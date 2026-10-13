import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { databaseManager, REPLICATION_STORES } from './core/DatabaseManager';
import { MutationManager } from './MutationManager';
import type { PendingMutation } from './types';

/**
 * A table that keeps one recomputed UPDATE per row replaces it without
 * touching that row's queued INSERT (MYK9-1090, Codex round 5).
 */
const USER = 'user-1';
let manager: MutationManager;

async function pending(): Promise<PendingMutation[]> {
  const db = await databaseManager.getDatabase('MutationManager');
  return (await db.getAll(REPLICATION_STORES.PENDING_MUTATIONS)) as PendingMutation[];
}

beforeEach(async () => {
  await databaseManager.reset();
  const client = { from: () => ({}) } as unknown as SupabaseClient;
  manager = new MutationManager(client, {
    getCurrentUserId: async () => USER,
    getCurrentUploadContext: async () => ({ authUserId: USER, supabaseClient: client }),
  });
  for (const operation of ['INSERT', 'UPDATE'] as const) {
    await manager.queueMutation(
      't',
      operation,
      'r1',
      { id: 'r1' },
      undefined,
      undefined,
      undefined,
      false
    );
  }
  await manager.queueMutation(
    't',
    'UPDATE',
    'r2',
    { id: 'r2' },
    undefined,
    undefined,
    undefined,
    false
  );
});

afterEach(async () => {
  await manager.clearAllMutations();
  manager.destroy();
  await databaseManager.reset();
});

describe('discardPendingMutationsForRow', () => {
  it('with an operation, discards only that operation for that row', async () => {
    await manager.discardPendingMutationsForRow('t', 'r1', 'UPDATE');

    const left = (await pending()).map(m => `${m.rowId}:${m.operation}`).sort();
    expect(left).toEqual(['r1:INSERT', 'r2:UPDATE']);
  });

  it('without one, discards every mutation for the row', async () => {
    await manager.discardPendingMutationsForRow('t', 'r1');

    expect((await pending()).map(m => `${m.rowId}:${m.operation}`)).toEqual(['r2:UPDATE']);
  });
});
