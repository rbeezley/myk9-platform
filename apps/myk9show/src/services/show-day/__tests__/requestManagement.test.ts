import { beforeEach, describe, expect, it, vi } from 'vitest';

const moveUpShowMapEntry = vi.fn();
const updateReplicatedDayOfScratch = vi.fn();
const updateEntry = vi.fn();

vi.mock('@/features/show-map/showMapActionMutations', () => ({
  moveUpShowMapEntry: (...args: unknown[]) => moveUpShowMapEntry(...args),
}));

vi.mock('@/services/show-day/checkInStatus', () => ({
  updateReplicatedDayOfScratch: (...args: unknown[]) => updateReplicatedDayOfScratch(...args),
}));

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: {
    updateEntry: (...args: unknown[]) => updateEntry(...args),
  },
}));

import {
  approveMoveUpRequestReplicated,
  approvePullRequestReplicated,
  denyMoveUpRequestReplicated,
  denyPullRequestReplicated,
} from '../requestManagement';

describe('show-day request management replication actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    moveUpShowMapEntry.mockResolvedValue({ targetClassName: 'Open' });
    updateReplicatedDayOfScratch.mockResolvedValue('mutation-1');
    updateEntry.mockResolvedValue('mutation-1');
  });

  it('approves move-up requests through replicated move-up mutations', async () => {
    await expect(approveMoveUpRequestReplicated('entry-1', 'class-2')).resolves.toEqual({
      error: null,
    });

    expect(moveUpShowMapEntry).toHaveBeenCalledWith({
      entryId: 'entry-1',
      targetClassId: 'class-2',
      reason: undefined,
    });
  });

  it('denies move-up requests through replicated entry status updates', async () => {
    await expect(denyMoveUpRequestReplicated('entry-1', 'Class full')).resolves.toEqual({
      error: null,
    });

    expect(updateEntry).toHaveBeenCalledWith('entry-1', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: 'Move-up denied: Class full',
      special_requests: 'Move-up denied: Class full',
    });
  });

  it('approves pull requests through replicated day-of scratch updates', async () => {
    await expect(approvePullRequestReplicated('entry-1')).resolves.toEqual({ error: null });

    expect(updateReplicatedDayOfScratch).toHaveBeenCalledWith('entry-1', 'Pull approved');
  });

  it('denies pull requests through replicated entry status updates', async () => {
    await expect(denyPullRequestReplicated('entry-1', 'Too late')).resolves.toEqual({
      error: null,
    });

    expect(updateEntry).toHaveBeenCalledWith('entry-1', {
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      specialRequests: 'Pull denied: Too late',
      special_requests: 'Pull denied: Too late',
    });
  });
});
