/**
 * Unit tests for persistRunOrderResults — the shared writer for computed
 * run-order results used by both at-show preset paths (single-class +
 * combined). Assertion-first: pin that each result's `{ runOrder }` value
 * reaches `replicatedEntriesTable.updateEntry` under the right id (the column
 * the replication layer routes through `ringside_update_entry`).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { persistRunOrderResults } from './persistRunOrderResults';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { updateEntry: vi.fn() },
}));

import { replicatedEntriesTable } from '@/services/replication';

describe('persistRunOrderResults', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('ok');
  });

  it('writes each result id with its exact runOrder', async () => {
    await persistRunOrderResults([
      { id: 'a1', runOrder: 1 },
      { id: 'b1', runOrder: 2 },
    ]);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(2);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a1', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b1', { runOrder: 2 });
  });

  it('persists nothing for an empty result set', async () => {
    await persistRunOrderResults([]);
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();
  });

  it('skips results whose run order is unchanged from the previous list', async () => {
    const previous = [
      { id: 'a1', exhibitorOrder: 1 },
      { id: 'b1', exhibitorOrder: 2 },
    ] as unknown as Entry[];

    await persistRunOrderResults(
      [
        { id: 'a1', runOrder: 1 },
        { id: 'b1', runOrder: 3 },
        { id: 'c1', runOrder: 2 },
      ],
      previous
    );

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(2);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b1', { runOrder: 3 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('c1', { runOrder: 2 });
  });

  it('rejects when a write fails so the caller can toast', async () => {
    vi.mocked(replicatedEntriesTable.updateEntry).mockRejectedValueOnce(new Error('queue full'));
    await expect(persistRunOrderResults([{ id: 'a1', runOrder: 1 }])).rejects.toThrow('queue full');
  });
});
