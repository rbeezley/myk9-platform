import { describe, it, expect } from 'vitest';
import { isInRingEntry } from '@myk9/ringside/run-queue';
import { transformEntry } from './atShowDataAdapter';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';

function makeEntry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return { id: 'entry-1', ...overrides } as ReplicatedEntry;
}

describe('transformEntry in-ring versus ring_entry_time (MYK9-1892)', () => {
  it('a leftover ring_entry_time on a checked-in, not-in-ring dog is not in the ring', () => {
    const entry = transformEntry(
      makeEntry({
        check_in_status: 'checked-in',
        is_in_ring: false,
        ring_entry_time: '2026-09-18T12:00:00Z',
      }),
      null
    );
    expect(isInRingEntry(entry)).toBe(false);
    expect(entry.inRing).toBe(false);
    // The stamp still travels as a timestamp for the class start time.
    expect(entry.ringEntryTime).toBe('2026-09-18T12:00:00Z');
  });

  it('a genuine in-ring dog is still in the ring', () => {
    const entry = transformEntry(
      makeEntry({ check_in_status: 'in-ring', ring_entry_time: '2026-09-18T12:00:00Z' }),
      null
    );
    expect(isInRingEntry(entry)).toBe(true);
  });
});
