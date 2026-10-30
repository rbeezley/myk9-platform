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

  it('writes only the rows whose run order changed in a 60-entry class (3rd card dropped on top)', async () => {
    const before = Array.from({ length: 60 }, (_, i) => entry(`e${i + 1}`, i + 1));
    const moved = [before[2], before[0], before[1], ...before.slice(3)];
    const after = moved.map((e, i) => entry(e.id, i + 1));

    await persistEntryRunOrder(after, before);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(3);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e3', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e1', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('e2', { runOrder: 3 });
  });

  it('writes every row only for a full reversal of a 60-entry class', async () => {
    const before = Array.from({ length: 60 }, (_, i) => entry(`e${i + 1}`, i + 1));
    const after = [...before].reverse().map((e, i) => entry(e.id, i + 1));

    await persistEntryRunOrder(after, before);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(60);
  });

  it('writes a gapped prior order down to the new contiguous numbering', async () => {
    const before = [entry('a', 1), entry('b', 5), entry('c', 7)];
    const after = [entry('a', 1), entry('b', 2), entry('c', 3)];

    await persistEntryRunOrder(after, before);

    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(2);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('c', { runOrder: 3 });
  });

  it('persists nothing for an empty reorder', async () => {
    await persistEntryRunOrder([]);
    expect(replicatedEntriesTable.updateEntry).not.toHaveBeenCalled();
  });
});
