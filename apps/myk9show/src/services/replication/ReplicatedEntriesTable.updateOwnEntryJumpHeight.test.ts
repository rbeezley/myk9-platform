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
    set = vi.fn().mockResolvedValue(undefined);
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

  it('sends a NULL precondition for an uncached row, never 0', async () => {
    get.mockResolvedValue(undefined);

    await table.updateOwnEntryJumpHeight('entry-1', '12"');

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('update_own_entry_jump_height', {
      p_entry_id: 'entry-1',
      p_jump_height: '12"',
      p_expected_version: null,
    });
    // MYK9-573: a row absent from the show-scoped replica is never written back.
    expect(set).not.toHaveBeenCalled();
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
