import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable.mapper';
import {
  isClassAccountedFor,
  isCurrentFinalPendingEntry,
  isFinalPendingExpectedEntry,
  recordCompletionIntentIfConfirmed,
} from './atShowClassCompletion';

const { getEntriesByClass, markClassCompletionPending } = vi.hoisted(() => ({
  getEntriesByClass: vi.fn(),
  markClassCompletionPending: vi.fn(),
}));

vi.mock('@/services/replication/ReplicatedEntriesTable', () => ({
  replicatedEntriesTable: { getEntriesByClass },
}));

vi.mock('@myk9/ringside', () => ({
  markClassCompletionPending,
}));

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: 'entry-1',
    classId: 'class-1',
    entryStatus: 'accepted',
    checkInStatus: 'checked-in',
    resultStatus: 'pending',
    isScored: false,
    ...overrides,
  };
}

describe('at-show class completion intent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('identifies the final expected entry using the server accounted-for rules', () => {
    const entries = [
      entry({ id: 'target' }),
      entry({ id: 'scored', isScored: true, resultStatus: 'qualified' }),
      entry({ id: 'absent', resultStatus: 'absent' }),
      entry({ id: 'scratched', entryStatus: 'scratched' }),
      entry({ id: 'pulled', checkInStatus: 'pulled' }),
      entry({ id: 'deleted', deletedAt: '2026-07-24T17:00:00.000Z' }),
    ];

    expect(isFinalPendingExpectedEntry(entries, 'target')).toBe(true);
  });

  it('rejects a candidate while another expected entry remains pending', () => {
    const entries = [entry({ id: 'target' }), entry({ id: 'other' })];

    expect(isFinalPendingExpectedEntry(entries, 'target')).toBe(false);
    expect(isClassAccountedFor(entries)).toBe(false);
  });

  it('re-reads the replicated snapshot before and after recording completion intent', async () => {
    getEntriesByClass
      .mockResolvedValueOnce([entry({ id: 'target' })])
      .mockResolvedValueOnce([entry({ id: 'target', isScored: true, resultStatus: 'qualified' })]);

    const wasFinalPending = await isCurrentFinalPendingEntry('class-1', 'target');
    await recordCompletionIntentIfConfirmed('class-1', wasFinalPending);

    expect(getEntriesByClass).toHaveBeenCalledTimes(2);
    expect(markClassCompletionPending).toHaveBeenCalledWith('class-1');
  });

  it('does not record intent when the refreshed class is still incomplete', async () => {
    getEntriesByClass.mockResolvedValue([
      entry({ id: 'target', isScored: true, resultStatus: 'qualified' }),
      entry({ id: 'other' }),
    ]);

    await recordCompletionIntentIfConfirmed('class-1', true);

    expect(markClassCompletionPending).not.toHaveBeenCalled();
  });
});
