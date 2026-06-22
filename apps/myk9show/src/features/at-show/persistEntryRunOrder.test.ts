/**
 * Unit tests for persistEntryRunOrder — the shared run-order persistence used by
 * both the single-class and combined Section A/B at-show entry lists.
 *
 * Assertion-first: the bug was the combined list silently discarding a drag
 * reorder. These pin that the helper writes each entry's run order to
 * `replicatedEntriesTable.updateEntry` with the `{ runOrder }` value-to-column
 * mapping the replication layer routes through `ringside_update_entry`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { persistEntryRunOrder } from './persistEntryRunOrder';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { updateEntry: vi.fn() },
}));

import { replicatedEntriesTable } from '@/services/replication';

function entry(id: string, exhibitorOrder: number | undefined): Entry {
  return { id, armband: 1, exhibitorOrder } as unknown as Entry;
}

describe('persistEntryRunOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('ok');
  });

  it('writes each entry run order via updateEntry using its exhibitorOrder', async () => {
    await persistEntryRunOrder([entry('a1', 2), entry('b1', 1)]);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(2);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a1', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b1', { runOrder: 1 });
  });

  it('falls back to the 1-based array index when exhibitorOrder is missing', async () => {
    await persistEntryRunOrder([entry('a1', undefined), entry('b1', undefined)]);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a1', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b1', { runOrder: 2 });
  });

  it('persists nothing for an empty reorder', async () => {
    await persistEntryRunOrder([]);
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();
  });
});
