/**
 * MYK9-1384: Entry Forms' Pull wrote entry_status = scratched AND check_in_status = pulled, but
 * Accept (and the status toast's Undo) wrote only entry_status. The accepted dog stayed `pulled`
 * for ringside, class readiness and the class page, and would not be called.
 *
 * The status-update unit tests pin the patch the builder returns. These run the patch through the
 * row the replica holds and then through the ringside run queue, which is what decides whether a
 * dog is called, so the assertion is on the visible outcome rather than on a field name.
 */

import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { buildReplicatedEntryStatusUpdate } from '@/services/database/entries/entryStatusUpdate';
import { pendingReplicatedByRunOrder } from './replicatedRunQueue';

function entry(overrides: Partial<ReplicatedEntry> = {}): ReplicatedEntry {
  return {
    id: 'e1',
    classId: 'class-1',
    armband: '101',
    runOrder: 1,
    entryStatus: 'confirmed',
    entry_status: 'confirmed',
    checkInStatus: 'no-status',
    check_in_status: 'no-status',
    ...overrides,
  } as ReplicatedEntry;
}

/** What the replica row looks like once a status write has been applied to it. */
function applied(row: ReplicatedEntry, patch: Partial<ReplicatedEntry>): ReplicatedEntry {
  return { ...row, ...patch };
}

const queuedIds = (rows: ReplicatedEntry[]) => pendingReplicatedByRunOrder(rows).map(r => r.id);

describe('ringside run queue after Entry Forms pulls and then accepts a dog (MYK9-1384)', () => {
  it('drops a pulled dog from the queue and marks it pulled on both aliases', () => {
    const pulled = applied(entry(), buildReplicatedEntryStatusUpdate('scratched'));

    // The queue drop alone is not discriminating: a scratched entry is already not runnable.
    // The pulled write is what the accepted case below has to undo.
    expect(pulled.checkInStatus).toBe('pulled');
    expect(pulled.check_in_status).toBe('pulled');
    expect(queuedIds([pulled])).toEqual([]);
  });

  it('calls the dog again once it is accepted', () => {
    const pulled = applied(entry(), buildReplicatedEntryStatusUpdate('scratched'));
    const accepted = applied(
      pulled,
      buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus: 'scratched',
      })
    );

    expect(queuedIds([accepted])).toEqual(['e1']);
  });

  it('puts a checked-in dog back exactly as it was when the Pull is undone', () => {
    const checkedIn = entry({ checkInStatus: 'checked-in', check_in_status: 'checked-in' });
    const pulled = applied(checkedIn, buildReplicatedEntryStatusUpdate('scratched'));
    const undone = applied(
      pulled,
      buildReplicatedEntryStatusUpdate('confirmed', undefined, undefined, {
        previousEntryStatus: 'scratched',
        priorCheckInStatus: 'checked-in',
      })
    );

    expect(undone.checkInStatus).toBe('checked-in');
    expect(undone.check_in_status).toBe('checked-in');
    expect(queuedIds([undone])).toEqual(['e1']);
  });
});
