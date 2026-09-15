/**
 * MYK9-535: exhibitor withdrawal is ONLINE-ONLY and writes nothing
 * optimistically.
 *
 * The first design queued the write optimistically and tried to undo the row on
 * an authorization failure. That revert could never fire: `setOnce` refuses to
 * overwrite a locally-dirty row with a clean server value (the guard that
 * protects offline scoring), so a refused withdrawal left the entry reading
 * "withdrawn" forever while the fee was still owed. These pin the replacement —
 * await the server, then store the CONFIRMED row clean — and, most importantly,
 * that a refusal leaves the local row untouched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable, WITHDRAW_OWN_ENTRY_RPC } from './ReplicatedEntriesTable';

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: supabaseMocks.rpc, from: supabaseMocks.from },
}));

/** The read-back chain: .from(view).select('*').eq('id', x).maybeSingle() */
function mockReadBack(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve(result));
  supabaseMocks.from.mockReturnValue(node);
  return node;
}

describe('ReplicatedEntriesTable.withdrawOwnEntry — online-only', () => {
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

  let table: ReplicatedEntriesTable;
  let set: ReturnType<typeof vi.fn>;
  let queueMutation: ReturnType<typeof vi.fn>;
  let getOrHydrateEntry: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    table = new ReplicatedEntriesTable();
    set = vi.fn().mockResolvedValue(undefined);
    queueMutation = vi.fn().mockResolvedValue('mutation-1');
    getOrHydrateEntry = vi.fn().mockResolvedValue(withdrawableEntry);
    const internals = table as unknown as Record<string, unknown>;
    internals.set = set;
    internals.queueMutation = queueMutation;
    internals.getOrHydrateEntry = getOrHydrateEntry;
    internals.get = vi.fn().mockResolvedValue(withdrawableEntry);
    internals.getServerVersion = vi.fn().mockResolvedValue(6);
    supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
    mockReadBack({
      data: { id: 'entry-1', entry_status: 'withdrawn', version: 7 },
      error: null,
    });
  });

  it('calls the RPC with the three named parameters', async () => {
    await table.withdrawOwnEntry('entry-1');

    expect(supabaseMocks.rpc).toHaveBeenCalledWith(WITHDRAW_OWN_ENTRY_RPC, {
      p_entry_id: 'entry-1',
      p_fields: { entry_status: 'withdrawn' },
      p_expected_version: 6,
    });
    expect(WITHDRAW_OWN_ENTRY_RPC).toBe('withdraw_own_entry');
  });

  it('never queues a mutation — the write is not offline-durable by design', async () => {
    await table.withdrawOwnEntry('entry-1');

    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('stores the CONFIRMED server row clean, with the server version', async () => {
    await table.withdrawOwnEntry('entry-1');

    const [id, row, isDirty, expectedVersion, serverVersion] = set.mock.calls.at(-1) ?? [];
    expect(id).toBe('entry-1');
    expect(row).toMatchObject({ entryStatus: 'withdrawn' });
    // Clean, so download sync still owns the row and `setOnce`'s dirty-row
    // guard is never in the way.
    expect(isDirty).toBe(false);
    expect(expectedVersion).toBeUndefined();
    expect(serverVersion).toBe(7);
  });

  it('reports the real from-status for the audit record', async () => {
    await expect(table.withdrawOwnEntry('entry-1')).resolves.toEqual({ from: 'confirmed' });
  });

  it('leaves the local row UNTOUCHED when the server refuses with 42501', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Entry entry-1 is paid; request a refund' },
    });

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toMatchObject({ code: '42501' });
    // The whole point of dropping the optimistic write: nothing local changed,
    // so there is no dirty row for a revert to fail to clear.
    expect(set).not.toHaveBeenCalled();
    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('refuses a paid entry locally and never reaches the server', async () => {
    getOrHydrateEntry.mockResolvedValue({ ...withdrawableEntry, paymentStatus: 'paid' });

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toThrow(/refund/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('refuses a checked-in entry locally — the day-of self-withdrawal hole', async () => {
    getOrHydrateEntry.mockResolvedValue({ ...withdrawableEntry, checkInStatus: 'at-gate' });

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toThrow(/checked in/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('reports "offline" rather than throwing when the row cannot be read at all', async () => {
    getOrHydrateEntry.mockRejectedValue(new Error('cold replica, no connection'));

    await expect(table.withdrawOwnEntry('entry-1')).rejects.toThrow(/connected/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('still marks the row withdrawn locally when only the read-back fails', async () => {
    mockReadBack({ data: null, error: { message: 'view unavailable' } });

    await table.withdrawOwnEntry('entry-1');

    const [, row, isDirty] = set.mock.calls.at(-1) ?? [];
    expect(row).toMatchObject({ entryStatus: 'withdrawn' });
    expect(isDirty).toBe(false);
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
