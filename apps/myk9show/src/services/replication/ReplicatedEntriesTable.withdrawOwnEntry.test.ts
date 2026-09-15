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

  const withdrawableEntry = {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    entryStatus: 'confirmed',
    paymentStatus: 'pending',
    checkInStatus: 'no-status',
    isScored: false,
    isInRing: false,
  };

  let getOrHydrateEntry: ReturnType<typeof vi.fn>;
  let requestUpload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    table = new ReplicatedEntriesTable();
    queueMutation = vi.fn().mockResolvedValue('mutation-1');
    set = vi.fn().mockResolvedValue(undefined);
    requestUpload = vi.fn();
    getOrHydrateEntry = vi.fn().mockResolvedValue(withdrawableEntry);
    // `queueMutation` / `set` / `getOrHydrateEntry` / `requestUpload` are
    // protected or private on ReplicatedTable.
    (table as unknown as Record<string, unknown>).queueMutation = queueMutation;
    (table as unknown as Record<string, unknown>).set = set;
    (table as unknown as Record<string, unknown>).requestUpload = requestUpload;
    (table as unknown as Record<string, unknown>).getOrHydrateEntry = getOrHydrateEntry;
  });

  it('queues the withdrawal through the withdraw_own_entry RPC', async () => {
    const { mutationId } = await table.withdrawOwnEntry('entry-1');

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

  it('hydrates a cold row instead of collapsing it, so OCC is not disabled', async () => {
    // `get() ?? {id}` would both skip every guard and drop serverVersion.
    await table.withdrawOwnEntry('entry-1');

    expect(getOrHydrateEntry).toHaveBeenCalledWith('entry-1');
  });

  it('queues BEFORE the optimistic cache write, then requests the upload', async () => {
    const order: string[] = [];
    queueMutation.mockImplementation(async () => {
      order.push('queue');
      return 'mutation-1';
    });
    set.mockImplementation(async () => {
      order.push('set');
    });
    requestUpload.mockImplementation(() => order.push('upload'));

    await table.withdrawOwnEntry('entry-1');

    // Durable-first: a queue-overflow throw must not strand a dirty row.
    expect(order).toEqual(['queue', 'set', 'upload']);
    expect(queueMutation.mock.calls[0]?.[5]).toBe(true); // deferUpload
  });

  it('optimistically marks the cached row withdrawn', async () => {
    await table.withdrawOwnEntry('entry-1');

    expect(set).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ entryStatus: 'withdrawn', entry_status: 'withdrawn' }),
      true
    );
  });

  it('refuses a paid entry locally and queues nothing at all', async () => {
    getOrHydrateEntry.mockResolvedValue({ ...withdrawableEntry, paymentStatus: 'paid' });

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toThrow(/refund/);
    expect(queueMutation).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('refuses a checked-in entry locally — the day-of self-withdrawal hole', async () => {
    getOrHydrateEntry.mockResolvedValue({ ...withdrawableEntry, checkInStatus: 'at-gate' });

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toThrow(/checked in/);
    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('reports eligibility for the Pull affordance from the same predicate', async () => {
    expect(await table.getWithdrawEligibility('entry-1')).toEqual({ allowed: true });

    getOrHydrateEntry.mockResolvedValue({ ...withdrawableEntry, isScored: true });
    expect(await table.getWithdrawEligibility('entry-1')).toMatchObject({
      allowed: false,
      code: 'scored',
    });
  });
});
