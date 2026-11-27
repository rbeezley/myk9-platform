import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { refreshDeskPaymentEntries } from '../refreshDeskPaymentEntries';

function entry(id: string, registrationId: string | undefined): ReplicatedEntry {
  return { id, showId: 'show-1', registrationId } as ReplicatedEntry;
}

/**
 * MYK9-2479 (Codex round 4 on #4461): after a desk payment is recorded, the entries of its
 * form are read back into the entries replica, where Entry Management reads each entry's
 * payment status, through the replica's established server read-back.
 */
describe('refreshDeskPaymentEntries', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(replicatedEntriesTable, 'getEntriesByShow').mockResolvedValue([
      entry('e-1', 'enr-1'),
      entry('e-2', 'enr-2'),
      entry('e-3', 'enr-1'),
      entry('e-4', undefined),
    ]);
  });

  it("reads back exactly the paid form's entries this device holds", async () => {
    const readBack = vi
      .spyOn(replicatedEntriesTable, 'refreshServerChangedEntries')
      .mockResolvedValue(undefined);

    await refreshDeskPaymentEntries('show-1', ['enr-1']);

    expect(replicatedEntriesTable.getEntriesByShow).toHaveBeenCalledWith('show-1');
    expect(readBack).toHaveBeenCalledWith(['e-1', 'e-3'], {
      insert: 'if-show-loaded',
      reason: 'desk payment recorded',
    });
  });
});
