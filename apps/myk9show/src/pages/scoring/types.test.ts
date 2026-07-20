import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { SecretaryEntry } from '@/services/database/entries';
import { secretaryEntryToScoringEntry, toScoringEntry } from './types';

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

  it('prefers the hydrated dog identity over a stale entry projection', () => {
    const entry: ReplicatedEntry = {
      id: 'entry-1',
      classId: 'class-1',
      dogId: 'dog-1',
      dog_call_name: 'Old Call Name',
      dog_breed: 'Old Breed',
      handler: 'Jamie Handler',
      armband: '101',
      status: 'accepted',
    };

    const scoringEntry = toScoringEntry(
      entry,
      {
        id: 'dog-1',
        name: 'Registered Name',
        callName: 'Current Call Name',
        breed: 'Current Breed',
      },
      0
    );

    expect(scoringEntry.callName).toBe('Current Call Name');
    expect(scoringEntry.breed).toBe('Current Breed');
  });
});

describe('secretaryEntryToScoringEntry', () => {
  it('preserves canonical dog identity and scored result fields', () => {
    const scoringEntry = secretaryEntryToScoringEntry(
      {
        id: 'entry-1',
        class_id: 'class-1',
        show_id: 'show-1',
        trial_id: 'trial-1',
        dog_id: 'dog-1',
        handler_id: 'handler-1',
        handler: 'Jamie Handler',
        armband: '101',
        entry_status: 'accepted',
        check_in_status: 'checked-in',
        is_in_ring: false,
        is_scored: true,
        result_status: 'qualified',
        search_time_seconds: 23.5,
        total_faults: 1,
        judge_notes: null,
        disqualification_reason: null,
        scoring_completed_at: '2026-08-01T10:00:00.000Z',
        run_order: 4,
        dog: {
          id: 'dog-1',
          name: 'Registered Name',
          call_name: 'Beacon',
          breed: 'Border Collie',
          owner: null,
        },
      } as unknown as SecretaryEntry,
      0
    );

    expect(scoringEntry).toMatchObject({
      entryId: 'entry-1',
      classId: 'class-1',
      callName: 'Beacon',
      breed: 'Border Collie',
      isScored: true,
      status: 'scored',
      exhibitorOrder: 4,
      result: {
        time: 23_500,
        faults: 1,
        qualification: 'Qualified',
      },
    });
  });
});
