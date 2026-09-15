/**
 * MYK9-535: `ReplicatedEntriesTable.withdrawOwnEntry` must queue the withdrawal
 * with the `withdraw_own_entry` RPC descriptor, not as a direct `entries`
 * UPDATE. The `entries_update` RLS policy admits only show managers, so a
 * direct UPDATE from an exhibitor dies with failureKind "authorization".
 *
 * The RPC descriptor rides the SAME MutationManager seam the ringside RPC uses
 * (`mutation-execute.ts` case 'UPDATE'), so the write stays offline-queued.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, WITHDRAW_OWN_ENTRY_RPC } from './ReplicatedEntriesTable';

vi.mock('@/services/database/supabaseClient', () => ({ supabase: {} }));

type QueueArgs = Parameters<
  (
    operation: string,
    rowId: string,
    payload: Record<string, unknown>,
    dependsOn?: string[],
    rpc?: { name: string; fields?: Record<string, unknown> }
  ) => void
>;

describe('ReplicatedEntriesTable.withdrawOwnEntry', () => {
  let table: ReplicatedEntriesTable;
  let queueMutation: ReturnType<typeof vi.fn>;
  let set: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    table = new ReplicatedEntriesTable();
    queueMutation = vi.fn().mockResolvedValue('mutation-1');
    set = vi.fn().mockResolvedValue(undefined);
    // `queueMutation` / `set` / `get` are protected on ReplicatedTable.
    (table as unknown as Record<string, unknown>).queueMutation = queueMutation;
    (table as unknown as Record<string, unknown>).set = set;
    (table as unknown as Record<string, unknown>).get = vi
      .fn()
      .mockResolvedValue({ id: 'entry-1', showId: 'show-1', entryStatus: 'confirmed' });
  });

  it('queues the withdrawal through the withdraw_own_entry RPC', async () => {
    const mutationId = await table.withdrawOwnEntry('entry-1');

    expect(mutationId).toBe('mutation-1');
    const args = queueMutation.mock.calls[0] as unknown as QueueArgs;
    expect(args[0]).toBe('UPDATE');
    expect(args[1]).toBe('entry-1');
    expect(args[4]).toEqual({
      name: WITHDRAW_OWN_ENTRY_RPC,
      fields: { entry_status: 'withdrawn' },
    });
    expect(WITHDRAW_OWN_ENTRY_RPC).toBe('withdraw_own_entry');
  });

  it('includes the withdrawal reason in the RPC field delta when given', async () => {
    await table.withdrawOwnEntry('entry-1', 'Dog is injured');

    const args = queueMutation.mock.calls[0] as unknown as QueueArgs;
    expect(args[4]).toEqual({
      name: WITHDRAW_OWN_ENTRY_RPC,
      fields: { entry_status: 'withdrawn', withdrawal_reason: 'Dog is injured' },
    });
  });

  it('optimistically marks the cached row withdrawn', async () => {
    await table.withdrawOwnEntry('entry-1');

    expect(set).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ entryStatus: 'withdrawn', entry_status: 'withdrawn' }),
      true
    );
  });
});
