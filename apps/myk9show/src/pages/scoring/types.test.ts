import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { toScoringEntry } from './types';

describe('toScoringEntry', () => {
  it('keeps projected dog identity when the dog replica is cold', () => {
    const entry: ReplicatedEntry = {
      id: 'entry-1',
      classId: 'class-1',
      dogId: 'dog-1',
      dog_call_name: 'Rex',
      dog_breed: 'German Shepherd',
      handler: 'Jamie Handler',
      armband: '101',
      status: 'accepted',
    };

    const scoringEntry = toScoringEntry(entry, null, 0);

    expect(scoringEntry.callName).toBe('Rex');
    expect(scoringEntry.breed).toBe('German Shepherd');
  });
});
