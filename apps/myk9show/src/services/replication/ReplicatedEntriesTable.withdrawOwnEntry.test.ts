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
import type { Database } from '@/types/supabase';

/**
 * MYK9-583, compile-level half of the null-version guard. `pnpm typecheck` runs
 * this file (`typecheck:tests`), so these are real assertions, not decoration.
 *
 * Without the `database-overrides.ts` widening, the first declaration is
 * TS2322 ("Type 'null' is not assignable to type 'number'") — which is exactly
 * the pressure that makes `?? 0` look like the fix. It is not: 0 is a valid
 * version. The second pins the widening as NULL specifically, so nobody
 * "fixes" a future generator mismatch by loosening the field to `any`.
 */
type WithdrawArgs = Database['public']['Functions']['withdraw_own_entry']['Args'];

const COLD_ROW_ARGS: WithdrawArgs = {
  p_entry_id: 'entry-1',
  p_fields: { entry_status: 'withdrawn' },
  p_expected_version: null,
};

const WIDENED_TO_NULL_ONLY: WithdrawArgs = {
  p_entry_id: 'entry-1',
  p_fields: { entry_status: 'withdrawn' },
  // @ts-expect-error a version is a number or null — never a string, and never `any`.
  p_expected_version: '7',
};

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
  // The batch eligibility read terminates on `.in(...)`, and returns a LIST.
  node.in = vi.fn(() =>
    Promise.resolve({
      data: result.data == null ? [] : [result.data],
      error: result.error,
    })
  );
  supabaseMocks.from.mockReturnValue(node);
  return node;
}

/**
 * MYK9-632: the default act is no longer implied. Every case below that means
 * "the exhibitor WITHDREW" says so, with one of the two recognised reasons.
 */
const WITHDRAW = { kind: 'withdraw', reason: 'in_season' } as const;

describe('withdraw_own_entry RPC arg types (MYK9-583)', () => {
  it('accepts a null p_expected_version without a cast', () => {
    expect(COLD_ROW_ARGS.p_expected_version).toBeNull();
    expect(WIDENED_TO_NULL_ONLY.p_entry_id).toBe('entry-1');
  });
});

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
  let get: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    table = new ReplicatedEntriesTable();
    // `set` resolves with the real ReplicatedSetResult shape (MYK9-575): the
    // callers now read `written` to avoid reporting a write that did not happen.
    set = vi.fn().mockResolvedValue({ written: true });
    queueMutation = vi.fn().mockResolvedValue('mutation-1');
    get = vi.fn().mockResolvedValue(withdrawableEntry);
    const internals = table as unknown as Record<string, unknown>;
    internals.set = set;
    internals.queueMutation = queueMutation;
    internals.get = get;
    internals.getServerVersion = vi.fn().mockResolvedValue(6);
    supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
    mockReadBack({
      data: { id: 'entry-1', entry_status: 'withdrawn', version: 7 },
      error: null,
    });
  });

  // MYK9-632: the two acts are told apart by p_kind and only a WITHDRAWAL
  // carries a reason. Getting either wrong stores the opposite act.
  it('calls the RPC with the five named parameters for a WITHDRAWAL', async () => {
    await table.withdrawOwnEntry('entry-1', WITHDRAW);

    expect(supabaseMocks.rpc).toHaveBeenCalledWith(WITHDRAW_OWN_ENTRY_RPC, {
      p_entry_id: 'entry-1',
      p_fields: { entry_status: 'withdrawn' },
      p_expected_version: 6,
      p_kind: 'withdraw',
      p_reason: 'in_season',
    });
    expect(WITHDRAW_OWN_ENTRY_RPC).toBe('withdraw_own_entry');
  });

  it('calls the RPC with entry_status=scratched and NO reason for a PULL', async () => {
    await table.withdrawOwnEntry('entry-1', { kind: 'pull' });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith(WITHDRAW_OWN_ENTRY_RPC, {
      p_entry_id: 'entry-1',
      p_fields: { entry_status: 'scratched' },
      p_expected_version: 6,
      p_kind: 'pull',
      p_reason: null,
    });
  });

  it('drops a reason handed to a PULL rather than storing a contradiction', async () => {
    await table.withdrawOwnEntry('entry-1', {
      kind: 'pull',
      reason: 'judge_change',
    });

    expect(supabaseMocks.rpc).toHaveBeenCalledWith(
      WITHDRAW_OWN_ENTRY_RPC,
      expect.objectContaining({ p_kind: 'pull', p_reason: null })
    );
  });

  it('refuses a WITHDRAWAL with no reason before it reaches the server', async () => {
    await expect(table.withdrawOwnEntry('entry-1', { kind: 'withdraw' })).rejects.toThrow(
      /withdrawal reason/i
    );
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('reports the status it actually committed, per act', async () => {
    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).resolves.toMatchObject({
      to: 'withdrawn',
    });
    await expect(table.withdrawOwnEntry('entry-1', { kind: 'pull' })).resolves.toMatchObject({
      to: 'scratched',
    });
  });

  it('never queues a mutation — the write is not offline-durable by design', async () => {
    await table.withdrawOwnEntry('entry-1', WITHDRAW);

    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('stores the CONFIRMED server row clean, with the server version', async () => {
    await table.withdrawOwnEntry('entry-1', WITHDRAW);

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
    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).resolves.toEqual({
      from: 'confirmed',
      to: 'withdrawn',
    });
  });

  it('leaves the local row UNTOUCHED when the server refuses with 42501', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Entry entry-1 is paid; request a refund' },
    });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toMatchObject({
      code: '42501',
    });
    // The whole point of dropping the optimistic write: nothing local changed,
    // so there is no dirty row for a revert to fail to clear.
    expect(set).not.toHaveBeenCalled();
    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('refuses a paid entry locally and never reaches the server', async () => {
    get.mockResolvedValue({ ...withdrawableEntry, paymentStatus: 'paid' });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/refund/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it('refuses a checked-in entry locally — the day-of self-withdrawal hole', async () => {
    get.mockResolvedValue({ ...withdrawableEntry, checkInStatus: 'at-gate' });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/checked in/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('reports "offline" when a COLD row cannot be read', async () => {
    get.mockResolvedValue(undefined);
    mockReadBack({ data: null, error: { message: 'network unreachable' } });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/connected/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('reports "no longer exists" when a cold row is ABSENT, not "offline"', async () => {
    // getOrHydrateEntry throws the same "not found" for both, and they need
    // different sentences.
    get.mockResolvedValue(undefined);
    mockReadBack({ data: null, error: null });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/no longer exists/);
    expect(supabaseMocks.rpc).not.toHaveBeenCalled();
  });

  it('reports "offline" for a WARM row whose RPC never reached Postgres', async () => {
    // A transport failure carries no SQLSTATE. Without this the exhibitor saw
    // the raw fetch error: the cold-cache path never runs for a cached row.
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
    });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/connected/);
    expect(set).not.toHaveBeenCalled();
  });

  it('retries ONCE at the version the conflict reports, then succeeds', async () => {
    // Without this a 40001 is a dead end: the retry re-reads the same stale
    // serverVersion out of IndexedDB and conflicts forever.
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40001', details: '9' } })
      .mockResolvedValueOnce({ data: 10, error: null });

    await table.withdrawOwnEntry('entry-1', WITHDRAW);

    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(2);
    expect(supabaseMocks.rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_version: 6 });
    expect(supabaseMocks.rpc.mock.calls[1]?.[1]).toMatchObject({ p_expected_version: 9 });
  });

  it('gives up after a SECOND conflict with a sentence the exhibitor can act on', async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40001', details: '9' } })
      .mockResolvedValueOnce({ data: null, error: { code: '40001', details: '11' } });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(
      /reopen it and try again/
    );
    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(2);
    expect(set).not.toHaveBeenCalled();
  });

  it('does not retry a conflict whose DETAIL carries no usable version', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', details: null } });

    await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(
      /reopen it and try again/
    );
    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('still marks the row withdrawn locally when only the read-back fails', async () => {
    mockReadBack({ data: null, error: { message: 'view unavailable' } });

    await table.withdrawOwnEntry('entry-1', WITHDRAW);

    const [, row, isDirty] = set.mock.calls.at(-1) ?? [];
    expect(row).toMatchObject({ entryStatus: 'withdrawn' });
    expect(isDirty).toBe(false);
  });

  describe('MYK9-573: never SEEDS the replica', () => {
    // `entries` replication is per-show scoped, so on account-level pages
    // (/exhibitor/entries, /my-entries) the store is normally EMPTY and
    // `readWithReplicationFallback` falls through to PostgREST only while
    // `isEmptyReadData` is true. Writing a row into an empty store made it
    // non-empty, the online read was skipped, and an unscoped getAll() returned
    // that row as the whole dataset: staging went from "All 259 / Upcoming 258"
    // to "All 2 / Upcoming 1" and stayed there across reloads.
    // LESSONS `partition-rearms-guards`.
    //
    // TWO writers had to stop seeding: the Pull affordance's eligibility check
    // (which runs per class row when the dialog OPENS — that is where staging's
    // two rows came from) and the post-withdrawal hydrate. Each guard below is
    // pinned by a test that only IT can hold, so no single-line deletion passes.
    const COLD_ROW = {
      id: 'entry-1',
      entry_status: 'confirmed',
      payment_status: 'pending',
      check_in_status: 'no-status',
      is_scored: false,
      version: 1,
    };

    it('reads every class row in ONE round trip, not one read per row', async () => {
      // Once the eligibility read stopped seeding, the per-id version became N
      // parallel PostgREST reads on EVERY dialog open — and a card groups by
      // registration_id, so a multi-dog order is routinely 20-40 rows.
      get.mockResolvedValue(undefined);
      const node = mockReadBack({ data: COLD_ROW, error: null });

      await table.getWithdrawEligibilityForEntries(['entry-1', 'entry-2', 'entry-3']);

      expect(supabaseMocks.from).toHaveBeenCalledTimes(1);
      expect(node.in).toHaveBeenCalledTimes(1);
      expect((node.in as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
        'id',
        ['entry-1', 'entry-2', 'entry-3'],
      ]);
      expect(node.maybeSingle).not.toHaveBeenCalled();
    });

    it('answers an id the batch did not return as missing, not as allowed', async () => {
      // Per-id semantics survive batching: only entry-1 comes back.
      get.mockResolvedValue(undefined);
      mockReadBack({ data: COLD_ROW, error: null });

      const batch = await table.getWithdrawEligibilityForEntries(['entry-1', 'entry-9']);

      expect(batch['entry-1']).toEqual({ allowed: true });
      expect(batch['entry-9']).toMatchObject({ allowed: false, code: 'missing' });
      expect(batch['entry-9']?.reason).toBeTruthy();
    });

    it('leaves every id unanswered when the batch itself fails', async () => {
      // The hook turns an unanswered id into its own lookup-failed refusal, so
      // the batch must not invent an "allowed" for one.
      get.mockResolvedValue(undefined);
      mockReadBack({ data: null, error: { message: 'view unavailable' } });

      const batch = await table.getWithdrawEligibilityForEntries(['entry-1', 'entry-2']);

      expect(batch).toEqual({});
    });

    it('never fetches an id it already has cached', async () => {
      get.mockResolvedValue(withdrawableEntry);
      mockReadBack({ data: COLD_ROW, error: null });

      const batch = await table.getWithdrawEligibilityForEntries(['entry-1']);

      expect(batch['entry-1']).toEqual({ allowed: true });
      expect(supabaseMocks.from).not.toHaveBeenCalled();
    });

    it('reports an entry deleted locally this session as missing', async () => {
      get.mockResolvedValue(undefined);
      (table as unknown as { _deletedIds: Set<string> })._deletedIds.add('entry-1');
      mockReadBack({ data: COLD_ROW, error: null });

      const batch = await table.getWithdrawEligibilityForEntries(['entry-1']);

      expect(batch['entry-1']).toMatchObject({ allowed: false, code: 'missing' });
      expect(supabaseMocks.from).not.toHaveBeenCalled();
    });

    it('refuses to withdraw an entry deleted locally this session', async () => {
      // The server copy must not resurrect a row the user just deleted here.
      get.mockResolvedValue(undefined);
      (table as unknown as { _deletedIds: Set<string> })._deletedIds.add('entry-1');
      mockReadBack({ data: COLD_ROW, error: null });

      await expect(table.withdrawOwnEntry('entry-1', WITHDRAW)).rejects.toThrow(/no longer exists/);
      expect(supabaseMocks.rpc).not.toHaveBeenCalled();
    });

    it('sends the COLD row version as the OCC token', async () => {
      // With the seed gone there is no serverVersion in the replica, so without
      // carrying the cold row's version the RPC would get null and the
      // retry-once-on-40001 contract would be unreachable on /my-entries.
      get.mockResolvedValue(undefined);
      mockReadBack({ data: { ...COLD_ROW, version: 7 }, error: null });
      supabaseMocks.rpc.mockResolvedValue({ data: 8, error: null });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(supabaseMocks.rpc.mock.calls[0]?.[1]).toMatchObject({ p_expected_version: 7 });
    });

    it('sends p_expected_version: null when the cold row carries NO version', async () => {
      // MYK9-583: the view can answer without a `version` (an older projection,
      // or a column the caller cannot read). NULL is the contract for "skip the
      // OCC check" in 20260915203300_withdraw_own_entry_rpc.sql; `?? 0` here
      // would raise a spurious 40001 on every such withdrawal, because entries
      // default to version 1 — and burn the single retry.
      get.mockResolvedValue(undefined);
      const { version: _omitted, ...noVersionRow } = { ...COLD_ROW, version: 7 };
      mockReadBack({ data: noVersionRow, error: null });
      supabaseMocks.rpc.mockResolvedValue({ data: 3, error: null });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        WITHDRAW_OWN_ENTRY_RPC,
        expect.objectContaining({ p_expected_version: null })
      );
    });

    it('the eligibility check does not cache a cold row (the dialog-open seed)', async () => {
      // EntryEditDialog runs this for EVERY class row on open, and it is mounted
      // on the account-level page. Via getOrHydrateEntry it inserted one row per
      // class before Pull was ever clicked — which also made `wasCached` true by
      // the time it mattered, bypassing the withdrawal-side gate entirely.
      get.mockResolvedValue(undefined);
      mockReadBack({ data: COLD_ROW, error: null });

      await table.getWithdrawEligibility('entry-1');
      await table.getWithdrawEligibility('entry-2');

      expect(set).not.toHaveBeenCalled();
    });

    it('leaves an EMPTY store empty after a successful withdrawal', async () => {
      get.mockResolvedValue(undefined);
      mockReadBack({ data: COLD_ROW, error: null });
      supabaseMocks.rpc.mockResolvedValue({ data: 2, error: null });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);
      expect(set).not.toHaveBeenCalled();
    });

    // Pins THREE guards at once — the probe's position before the RPC, the cold
    // `wasCached`, and the early return in hydrateConfirmedRow. Do not retire it
    // casually: without it, moving the probe after the RPC leaves the whole file
    // green.
    it('does not write when a sync lands DURING the call (pins the pre-RPC probe)', async () => {
      // Absent at the probe, present afterwards. Only the BEFORE-the-RPC capture
      // can hold here — the fresh re-check guards the opposite direction and
      // would happily write. Probing after the RPC instead leaves every other
      // test green, so without this one the ordering claim is untested.
      get.mockResolvedValueOnce(undefined).mockResolvedValue(withdrawableEntry);
      mockReadBack({ data: COLD_ROW, error: null });
      supabaseMocks.rpc.mockResolvedValue({ data: 2, error: null });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(set).not.toHaveBeenCalled();
    });

    it('does not re-INSERT a row evicted during the call (pins the read-back re-check)', async () => {
      // The reverse race: present at the probe, so `wasCached` is true, but a
      // sign-out / scope change / store clear emptied the store while the RPC
      // was in flight. Only the fresh `get` before the write can hold here.
      get.mockResolvedValueOnce(withdrawableEntry).mockResolvedValue(undefined);
      supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
      mockReadBack({
        data: { id: 'entry-1', entry_status: 'withdrawn', version: 7 },
        error: null,
      });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(set).not.toHaveBeenCalled();
    });

    it('does not re-INSERT via the fallback patch either (pins the fallback re-check)', async () => {
      // Same eviction, but the read-back ALSO fails, so the status-patch branch
      // is the one that must no-op. Only its own `get` check can hold here.
      get.mockResolvedValueOnce(withdrawableEntry).mockResolvedValue(undefined);
      supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
      mockReadBack({ data: null, error: { message: 'view unavailable' } });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      expect(set).not.toHaveBeenCalled();
    });

    it('still updates the row when the store was and stays populated', async () => {
      // The show-scoped case: /at-show and show pages hydrate entries, and there
      // the confirmed row must land so the UI reflects the withdrawal at once.
      get.mockResolvedValue(withdrawableEntry);
      mockReadBack({
        data: { id: 'entry-1', entry_status: 'withdrawn', version: 7 },
        error: null,
      });

      await table.withdrawOwnEntry('entry-1', WITHDRAW);

      const [id, row, isDirty] = set.mock.calls.at(-1) ?? [];
      expect(id).toBe('entry-1');
      expect(row).toMatchObject({ entryStatus: 'withdrawn' });
      expect(isDirty).toBe(false);
    });
  });

  it('reports eligibility for the Pull affordance from the same predicate', async () => {
    expect(await table.getWithdrawEligibility('entry-1')).toEqual({ allowed: true });

    get.mockResolvedValue({ ...withdrawableEntry, isScored: true });
    expect(await table.getWithdrawEligibility('entry-1')).toMatchObject({
      allowed: false,
      code: 'scored',
    });
  });
});
