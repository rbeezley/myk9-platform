/**
 * Test fixtures for replicatedTableMappers.roundtrip.test.ts.
 *
 * Holds the `Testable*` subclasses that expose each replicated table's
 * protected `rebuildUpdatePayload` (which delegates to the private
 * `toSupabaseRow`), mirroring the TestableEntriesTable pattern in
 * ReplicatedEntriesTable.test.ts. Extracted into this sibling module to keep
 * the round-trip test file focused on the assertions.
 *
 * This module is only imported by the colocated `.test.ts` and carries no
 * production behavior.
 */
import { ReplicatedArmbandsTable, type ReplicatedArmband } from './ReplicatedArmbandsTable';
import { ReplicatedClubsTable, type ReplicatedClub } from './ReplicatedClubsTable';
import { ReplicatedDogsTable, type ReplicatedDog } from './ReplicatedDogsTable';
import { ReplicatedShowsTable, type ReplicatedShow } from './ReplicatedShowsTable';
import { ReplicatedTrialsTable, type ReplicatedTrial } from './ReplicatedTrialsTable';
import {
  ReplicatedJudgeAssignmentsTable,
  type ReplicatedJudgeAssignment,
} from './ReplicatedJudgeAssignmentsTable';

export class TestableArmbandsTable extends ReplicatedArmbandsTable {
  publicRebuildUpdatePayload(armband: ReplicatedArmband): Record<string, unknown> {
    return this.rebuildUpdatePayload(armband);
  }
}

export class TestableClubsTable extends ReplicatedClubsTable {
  publicRebuildUpdatePayload(club: ReplicatedClub): Record<string, unknown> {
    return this.rebuildUpdatePayload(club);
  }
}

export class TestableDogsTable extends ReplicatedDogsTable {
  publicRebuildUpdatePayload(dog: ReplicatedDog): Record<string, unknown> {
    return this.rebuildUpdatePayload(dog);
  }
}

export class TestableShowsTable extends ReplicatedShowsTable {
  publicRebuildUpdatePayload(show: ReplicatedShow): Record<string, unknown> {
    return this.rebuildUpdatePayload(show);
  }
}

export class TestableTrialsTable extends ReplicatedTrialsTable {
  publicRebuildUpdatePayload(trial: ReplicatedTrial): Record<string, unknown> {
    return this.rebuildUpdatePayload(trial);
  }
}

export class TestableJudgeAssignmentsTable extends ReplicatedJudgeAssignmentsTable {
  publicRebuildUpdatePayload(assignment: ReplicatedJudgeAssignment): Record<string, unknown> {
    return this.rebuildUpdatePayload(assignment);
  }
}

/**
 * A judge_assignments joined row with the embedded classes/trials snapshot the
 * enriched sync select produces. `show_id`/`trial_id` are null on the row so
 * tests can assert the fallback to the embedded trial's values.
 */
export function makeJudgeAssignmentJoinedRow(): Record<string, unknown> {
  return {
    id: 'assignment-1',
    person_id: 'judge-1',
    show_id: null,
    trial_id: null,
    class_id: 'class-1',
    status: 'confirmed',
    invited_at: '2026-06-01T10:00:00.000Z',
    confirmed_at: '2026-06-01T11:00:00.000Z',
    fee: 100,
    notes: 'Ring 1',
    day_capacity_override: 50,
    classes: {
      name: 'Novice Container',
      element: 'Container',
      level: 'Novice',
      status: 'scheduled',
      start_time: '09:00',
      scored_count: 0,
      checked_in_count: 0,
      total_entries_count: 10,
      trial_id: 'trial-1',
      trials: {
        date: '2026-08-01',
        timezone: 'America/New_York',
        show_id: 'show-1',
      },
    },
  };
}
