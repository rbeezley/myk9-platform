// CRUD standard Phase 1 (MYK9-915): the trial, entry and club soft-delete and restore
// services go through the SECURITY DEFINER RPCs. A direct `.update({ deleted_at })` is
// refused by the direct-write trigger, so a regression here is a runtime 42501.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({
  single: vi.fn(),
  rpc: vi.fn(),
  entrySingle: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabaseClient', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedTrialsTable', () => ({
  replicatedTrialsTable: {},
}));
vi.mock('@/services/replication/ReplicatedShowsTable', () => ({
  replicatedShowsTable: {},
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { acknowledgeServerDeletion: vi.fn() },
}));

import { deleteClub, restoreClub } from './clubs/reads';
import { deleteTrial, restoreTrial } from './trials/reads';
import { restoreEntry } from './entries/admin';

describe('soft-delete services call the RPCs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.single.mockResolvedValue({ data: { id: 'row-1', name: 'Row' }, error: null });
    mocks.rpc.mockReturnValue({ single: mocks.single });
    mocks.from.mockImplementation(() => {
      throw new Error('direct table access must not happen on this path');
    });
  });

  it('deleteClub calls soft_delete_club and keeps the { data: {id,name}, error } shape', async () => {
    const result = await deleteClub('club-1', 'admin-1');
    expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_club', { p_club_id: 'club-1' });
    expect(result).toEqual({ data: { id: 'row-1', name: 'Row' }, error: null });
  });

  it('restoreClub calls restore_club', async () => {
    const result = await restoreClub('club-1');
    expect(mocks.rpc).toHaveBeenCalledWith('restore_club', { p_club_id: 'club-1' });
    expect(result.error).toBeNull();
  });

  it('deleteClub returns the RPC refusal as an error, not a throw', async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: 'MK011', message: 'This club still has shows.' },
    });
    const result = await deleteClub('club-1');
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('deleteTrial calls soft_delete_trial', async () => {
    const result = await deleteTrial('trial-1', 'sec-1');
    expect(mocks.rpc).toHaveBeenCalledWith('soft_delete_trial', { p_trial_id: 'trial-1' });
    expect(result.error).toBeNull();
  });

  it('restoreTrial calls restore_trial', async () => {
    const result = await restoreTrial('trial-1');
    expect(mocks.rpc).toHaveBeenCalledWith('restore_trial', { p_trial_id: 'trial-1' });
    expect(result.error).toBeNull();
  });

  it('restoreEntry calls restore_entry, then re-reads the row for its relations', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.entrySingle.mockResolvedValue({
      data: { id: 'entry-1', class_id: 'class-1', show_id: 'show-1', dog_id: 'dog-1' },
      error: null,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ single: mocks.entrySingle }) }),
    }));
    const result = await restoreEntry('entry-1');
    expect(mocks.rpc).toHaveBeenCalledWith('restore_entry', { p_entry_id: 'entry-1' });
    expect(result.data).toMatchObject({ id: 'entry-1', class_id: 'class-1' });
    expect(result.error).toBeNull();
  });

  it('restoreEntry reports the RPC refusal and does not re-read', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'MK013', message: 'Restore the class first' },
    });
    const result = await restoreEntry('entry-1');
    expect(result.error).toBeTruthy();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
