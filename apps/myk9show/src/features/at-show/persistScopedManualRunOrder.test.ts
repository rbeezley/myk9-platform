/**
 * A single-section manual drag must reach the replication queue through the
 * shared writer, with the dialog's renumber choice deciding the other section.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Entry } from '@myk9/ringside';
import { persistScopedManualRunOrder } from './persistScopedManualRunOrder';

vi.mock('@/services/replication', () => ({
  replicatedEntriesTable: { updateEntry: vi.fn() },
}));

import { replicatedEntriesTable } from '@/services/replication';

function entry(id: string, armband: number, section: 'A' | 'B', exhibitorOrder: number): Entry {
  return { id, armband, section, exhibitorOrder } as unknown as Entry;
}

const all = [entry('a1', 101, 'A', 1), entry('b1', 201, 'B', 2), entry('a2', 102, 'A', 3)];
// What the drag hook hands back after a2 is dropped above a1 (index + 1 orders).
const dragged = [entry('a2', 102, 'A', 1), entry('a1', 101, 'A', 2)];

describe('persistScopedManualRunOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(replicatedEntriesTable.updateEntry).mockResolvedValue('ok');
  });

  it('preserve writes only Section A, inside the slots it already held', async () => {
    await persistScopedManualRunOrder(all, dragged, { section: 'A', renumberMode: 'preserve' });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledTimes(2);
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a2', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a1', { runOrder: 3 });
  });

  it('renumber writes A first, then moves B after it', async () => {
    await persistScopedManualRunOrder(all, dragged, { section: 'A', renumberMode: 'renumber' });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a2', { runOrder: 1 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('a1', { runOrder: 2 });
    expect(replicatedEntriesTable.updateEntry).toHaveBeenCalledWith('b1', { runOrder: 3 });
  });

  it('rejects when a write cannot be queued so the drag hook can report it', async () => {
    vi.mocked(replicatedEntriesTable.updateEntry).mockRejectedValue(new Error('quota'));
    await expect(
      persistScopedManualRunOrder(all, dragged, { section: 'A', renumberMode: 'preserve' })
    ).rejects.toThrow('quota');
  });
});
