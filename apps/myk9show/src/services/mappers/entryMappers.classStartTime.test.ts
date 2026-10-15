import { describe, it, expect } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { mapReplicatedClassToEntryRow } from './entryMappers';

describe('mapReplicatedClassToEntryRow start time (MYK9-1193)', () => {
  it('carries the replicated class start time as start_time, as the PostgREST embed does', () => {
    const row = mapReplicatedClassToEntryRow(
      fromPartial({ id: 'c1', name: 'Container Novice', startTime: '9:00 AM' })
    );
    expect(row.start_time).toBe('9:00 AM');
  });
});
