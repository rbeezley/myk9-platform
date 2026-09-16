/**
 * MYK9-561: the exhibitor's jump-height save goes through the
 * `update_own_entry_jump_height` SECURITY DEFINER RPC, not a direct
 * `UPDATE entries`.
 *
 * ASSERTION-FIRST: the RPC NAME and the exact argument keys are the value this
 * bug was about — a direct UPDATE matched zero rows under `entries_update` and
 * `.single()` reported PGRST116. These pin the name, the three parameter keys,
 * the OCC token (null is "no precondition", never 0), and that the write is
 * never queued through the MutationManager.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import {
  JumpHeightConflictError,
  JumpHeightNotFoundError,
  JumpHeightUnavailableError,
  UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC,
} from '@/services/database/entries/jumpHeightErrors';

const supabaseMocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: supabaseMocks.rpc, from: supabaseMocks.from },
}));

/** The cold OCC read: .from(view).select(...).eq('id', x).maybeSingle() */
function mockColdRead(result: { data: unknown; error: unknown }) {
  const node: Record<string, unknown> = {};
  node.select = vi.fn(() => node);
  node.eq = vi.fn(() => node);
  node.maybeSingle = vi.fn(() => Promise.resolve(result));
  supabaseMocks.from.mockReturnValue(node);
  return node;
}

describe('ReplicatedEntriesTable.updateOwnEntryJumpHeight', () => {
  const cachedEntry = {
    id: 'entry-1',
    showId: 'show-1',
    classId: 'class-1',
    entryStatus: 'confirmed',
    jumpHeight: '8"',
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
    get = vi.fn().mockResolvedValue(cachedEntry);
    const internals = table as unknown as Record<string, unknown>;
    internals.set = set;
    internals.queueMutation = queueMutation;
    internals.get = get;
    internals.getServerVersion = vi.fn().mockResolvedValue(6);
    supabaseMocks.rpc.mockResolvedValue({ data: 7, error: null });
  });

  it('calls the RPC by name with the three named parameters', async () => {
    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('update_own_entry_jump_height', {
      p_entry_id: 'entry-1',
      p_jump_height: '12"',
      p_expected_version: 6,
    });
    expect(UPDATE_OWN_ENTRY_JUMP_HEIGHT_RPC).toBe('update_own_entry_jump_height');
  });

  it('never queues a mutation — the write is online-only by design', async () => {
    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(queueMutation).not.toHaveBeenCalled();
  });

  it('patches the confirmed height into a cached row, clean, at the new version', async () => {
    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(set).toHaveBeenCalledWith(
      'entry-1',
      expect.objectContaining({ jumpHeight: '12"' }),
      false,
      undefined,
      7
    );
  });

  it('reads the OCC token for a COLD row instead of sending no precondition', async () => {
    // The account-scoped /exhibitor/entries surface — the exhibitor's primary
    // one for this edit — has no show-scoped replica. Sending null there would
    // make every save last-write-wins and leave the 40001 retry unreachable.
    get.mockResolvedValue(undefined);
    mockColdRead({ data: { id: 'entry-1', version: 4 }, error: null });

    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('update_own_entry_jump_height', {
      p_entry_id: 'entry-1',
      p_jump_height: '12"',
      p_expected_version: 4,
    });
    // MYK9-573: a row absent from the show-scoped replica is never written back.
    expect(set).not.toHaveBeenCalled();
  });

  it('falls back to a NULL precondition only when the version is unknowable', async () => {
    get.mockResolvedValue(undefined);
    mockColdRead({ data: null, error: { message: 'Failed to fetch' } });

    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('update_own_entry_jump_height', {
      p_entry_id: 'entry-1',
      p_jump_height: '12"',
      // null, never 0 — 0 is a real version (MYK9-583).
      p_expected_version: null,
    });
  });

  it('retries once at the server version carried in a 40001 DETAIL', async () => {
    supabaseMocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: '40001', details: '9' } })
      .mockResolvedValueOnce({ data: 10, error: null });

    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(supabaseMocks.rpc).toHaveBeenNthCalledWith(2, 'update_own_entry_jump_height', {
      p_entry_id: 'entry-1',
      p_jump_height: '12"',
      p_expected_version: 9,
    });
  });

  it('throws a conflict rather than retrying at version 0 when DETAIL is empty', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', details: '' } });

    await expect(table.updateOwnEntryJumpHeight('entry-1', '12"')).rejects.toBeInstanceOf(
      JumpHeightConflictError
    );
    expect(supabaseMocks.rpc).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
  });

  it('reports a missing row and a transport failure as their own typed errors', async () => {
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { code: 'P0002' } });
    await expect(table.updateOwnEntryJumpHeight('entry-1', '12"')).rejects.toBeInstanceOf(
      JumpHeightNotFoundError
    );

    supabaseMocks.rpc.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(table.updateOwnEntryJumpHeight('entry-1', '12"')).rejects.toBeInstanceOf(
      JumpHeightUnavailableError
    );
  });

  it('classifies a THROWN rpc as unavailable rather than leaking a transport error', async () => {
    supabaseMocks.rpc.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(table.updateOwnEntryJumpHeight('entry-1', '12"')).rejects.toBeInstanceOf(
      JumpHeightUnavailableError
    );
    expect(set).not.toHaveBeenCalled();
  });

  it('leaves the local row untouched when the server refuses', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'Entry entry-1 is checked in at the show' },
    });

    await expect(table.updateOwnEntryJumpHeight('entry-1', '12"')).rejects.toMatchObject({
      code: '42501',
    });
    expect(set).not.toHaveBeenCalled();
  });
});
