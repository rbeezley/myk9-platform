import { describe, expect, it } from 'vitest';
import { entryToSupabaseRow, type ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

describe('entryToSupabaseRow deletion field', () => {
  it('does not let an in-flight live-row update clear a newer server soft deletion', () => {
    const payload = entryToSupabaseRow({
      id: 'entry-1',
      showId: 'show-1',
      classId: 'class-1',
      deletedAt: null,
      entryStatus: 'confirmed',
    } as ReplicatedEntry);

    expect(payload).not.toHaveProperty('deleted_at');
  });

  it('preserves an explicit soft deletion timestamp in a tombstone payload', () => {
    const payload = entryToSupabaseRow({
      id: 'entry-1',
      deletedAt: '2026-09-29T14:00:00.000Z',
    } as ReplicatedEntry);

    expect(payload).toHaveProperty('deleted_at', '2026-09-29T14:00:00.000Z');
  });
});
