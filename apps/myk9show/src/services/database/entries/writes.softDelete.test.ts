import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseError } from '@/services/database/databaseError';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  acknowledgeServerDeletion: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: { from: () => ({ update: mocks.update }) },
  logQuery: vi.fn(),
  createDatabaseError,
}));
vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { acknowledgeServerDeletion: mocks.acknowledgeServerDeletion },
}));

import { deleteEntry } from './writes';

describe('secretary soft-delete cache coherence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ single: mocks.single });
    mocks.single.mockResolvedValue({ data: { version: 5 }, error: null });
    mocks.acknowledgeServerDeletion.mockResolvedValue(undefined);
  });

  it('evicts the warm show replica after the server accepts removal', async () => {
    const result = await deleteEntry('removed-entry', 'secretary-1');
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_by: 'secretary-1' })
    );
    expect(mocks.eq).toHaveBeenCalledWith('id', 'removed-entry');
    expect(mocks.acknowledgeServerDeletion).toHaveBeenCalledWith('removed-entry', 5);
    expect(result.error).toBeNull();
  });

  it('keeps the local row when the server rejects removal', async () => {
    mocks.single.mockResolvedValue({ data: null, error: new Error('denied') });
    const result = await deleteEntry('live-entry', 'secretary-1');
    expect(mocks.acknowledgeServerDeletion).not.toHaveBeenCalled();
    expect(result.error).toBeTruthy();
  });
});
