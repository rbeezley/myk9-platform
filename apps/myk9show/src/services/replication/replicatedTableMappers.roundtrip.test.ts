/**
 * Shared round-trip harness for the Replicated*Table mappers.
 *
 * Each replicated table maps a Supabase DB row (snake_case) into an app-level
 * domain object (camelCase) via a `rowToX` function, and maps the domain
 * object back into an UPDATE-ready DB row via the private `toSupabaseRow`
 * (exposed here through `rebuildUpdatePayload`, which each table already
 * overrides to call it — see ReplicatedEntriesTable.test.ts for the pattern
 * this follows).
 *
 * Rather than nine near-identical hand-written suites, this exercises the
 * db-row -> domain -> db-row path for each table through one small harness,
 * asserting field-level correctness only for the columns each mapper
 * actually round-trips (server-generated columns like `updated_at` are
 * intentionally excluded — they're stamped fresh on every write).
 *
 * WaitlistEntries has no write-back path (server-authoritative, no
 * `toSupabaseRow`), so it only exercises the db-row -> domain half.
 */
import { describe, expect, it } from 'vitest';

import { rowToArmband } from './ReplicatedArmbandsTable';
import { rowToClass } from './ReplicatedClassesTable';
import { rowToClub } from './ReplicatedClubsTable';
import { rowToDog } from './ReplicatedDogsTable';
import { rowToShow } from './ReplicatedShowsTable';
import { rowToTrial } from './ReplicatedTrialsTable';
import { rowToJudgeAssignment } from './ReplicatedJudgeAssignmentsTable';
import { rowToWaitlistEntry } from './ReplicatedWaitlistEntriesTable';
// Testable* subclasses expose each table's protected `rebuildUpdatePayload`;
// see replicatedTableMappers.fixtures.ts for why they live in a sibling module.
import {
  TestableArmbandsTable,
  TestableClubsTable,
  TestableDogsTable,
  TestableShowsTable,
  TestableTrialsTable,
  TestableJudgeAssignmentsTable,
  makeJudgeAssignmentJoinedRow,
} from './replicatedTableMappers.fixtures';

describe('Replicated*Table mappers — db row -> domain -> db row', () => {
  it('armbands: maps nullable FKs and round-trips core identity fields', () => {
    const row = {
      id: 'armband-1',
      show_id: 'show-1',
      trial_id: null,
      dog_id: 'dog-1',
      entry_id: null,
      armband_number: '101',
      assigned_at: '2026-06-01T10:00:00.000Z',
      is_available: false,
      created_at: '2026-06-01T09:00:00.000Z',
    };

    const domain = rowToArmband(row as never);
    expect(domain).toMatchObject({
      id: 'armband-1',
      showId: 'show-1',
      trialId: undefined,
      dogId: 'dog-1',
      armbandNumber: '101',
      isAvailable: false,
    });

    const table = new TestableArmbandsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).toMatchObject({
      id: 'armband-1',
      show_id: 'show-1',
      dog_id: 'dog-1',
      armband_number: '101',
      is_available: false,
    });
  });

  it('clubs: maps optional fields and round-trips core identity fields', () => {
    const row = {
      id: 'club-1',
      name: 'Border Collie Club',
      address: '123 Main St',
      city: 'Springfield',
      state: 'IL',
      zip_code: '62701',
      club_number: 'BC-100',
      email: 'club@example.com',
      phone: '555-1234',
      website: 'https://example.com',
      logo_url: null,
      description: null,
      created_at: '2026-06-01T09:00:00.000Z',
      updated_at: '2026-06-01T09:00:00.000Z',
      deleted_at: null,
      deleted_by: null,
    };

    const domain = rowToClub(row as never);
    expect(domain).toMatchObject({
      id: 'club-1',
      name: 'Border Collie Club',
      email: 'club@example.com',
      phone: '555-1234',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      clubNumber: 'BC-100',
    });

    const table = new TestableClubsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).toMatchObject({
      id: 'club-1',
      name: 'Border Collie Club',
      email: 'club@example.com',
      phone: '555-1234',
      city: 'Springfield',
      state: 'IL',
      zip_code: '62701',
      club_number: 'BC-100',
    });
  });

  it('dogs: maps optional fields and round-trips core identity fields', () => {
    const row = {
      id: 'dog-1',
      name: 'Rex the Great',
      call_name: 'Rex',
      breed: 'Border Collie',
      sex: 'M',
      date_of_birth: '2020-01-01',
      owner_id: 'owner-1',
      height: '20',
      weight: '45',
      color: 'Black and White',
      microchip_number: '123456789',
      spayed_neutered: true,
      image_url: null,
      status: 'active',
      deleted_at: null,
    };

    const domain = rowToDog(row as never);
    expect(domain).toMatchObject({
      id: 'dog-1',
      name: 'Rex the Great',
      callName: 'Rex',
      breed: 'Border Collie',
      ownerId: 'owner-1',
      isSpayedNeutered: true,
      status: 'active',
    });

    const table = new TestableDogsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).toMatchObject({
      id: 'dog-1',
      call_name: 'Rex',
      breed: 'Border Collie',
      owner_id: 'owner-1',
      spayed_neutered: true,
      status: 'active',
    });
    // MYK9-90 §5.3 — the write path must NOT carry `name`. `ReplicatedDog.name`
    // is a read-side display alias that falls back to the call name, so writing
    // it back would copy the call name into the legacy `dogs.name` column on
    // every sync — exactly the duplicated identity storage this change removes.
    expect(rebuilt).not.toHaveProperty('name');
  });

  it('dogs: a row with no legacy name still yields a display name, and never writes one back', () => {
    // Every dog created after the §5.2 migration has `dogs.name = NULL`; only
    // `call_name` is populated (it is NOT NULL from that migration on).
    const row = {
      id: 'dog-2',
      name: null,
      call_name: 'Tera',
      breed: 'Border Collie',
      sex: null,
      date_of_birth: null,
      owner_id: 'owner-1',
      height: null,
      weight: null,
      color: null,
      microchip_number: null,
      spayed_neutered: null,
      image_url: null,
      status: 'active',
      deleted_at: null,
    };

    const domain = rowToDog(row as never);
    // Not blank: the offline read must agree with the online read
    // (`mapDatabaseToDog` applies the same fallback).
    expect(domain.name).toBe('Tera');
    expect(domain.callName).toBe('Tera');

    const table = new TestableDogsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).not.toHaveProperty('name');
    expect(rebuilt).toMatchObject({ id: 'dog-2', call_name: 'Tera' });
  });

  it('dogs: the write path never sends a null call_name', () => {
    // MYK9-90 §5.1 — `dogs.call_name` is NOT NULL after 20260727110000. This
    // payload is built as Record<string, unknown>, so TypeScript cannot catch a
    // null the way it does on the DbDogInsert paths — the queued mutation would
    // only fail when it reached the database, after the user was told the dog
    // had been saved. `ReplicatedDog.name` is the derived fallback.
    const table = new TestableDogsTable();

    const withoutCallName = table.publicRebuildUpdatePayload({
      id: 'dog-3',
      name: 'Tera',
      breed: 'Border Collie',
    } as never);
    expect(withoutCallName.call_name).toBe('Tera');

    const withNeither = table.publicRebuildUpdatePayload({
      id: 'dog-4',
      name: '',
      breed: 'Border Collie',
    } as never);
    // Omitted, never null: on an update this leaves the stored call name alone.
    expect(withNeither).not.toHaveProperty('call_name');
  });

  it('shows: maps optional fields, defaults, and round-trips core identity fields', () => {
    const row = {
      id: 'show-1',
      name: 'Spring Classic',
      organization: 'AKC',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      location: 'Fairgrounds',
      venue_name: 'Main Hall',
      city: 'Springfield',
      state: 'IL',
      status: 'published',
      entry_open_date: null,
      entry_close_date: null,
      pre_entry_fee: 25,
      day_of_show_fee: 35,
      starting_armband_number: null,
      club_id: 'club-1',
      max_entries_per_dog: null,
      max_total_entries: null,
      default_judge_day_capacity: null,
      allow_non_owner_handlers: null,
      is_nationals: null,
      accept_check_payments: null,
      accept_cash_payments: null,
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
    };

    const domain = rowToShow(row as never);
    expect(domain).toMatchObject({
      id: 'show-1',
      name: 'Spring Classic',
      organization: 'AKC',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      clubId: 'club-1',
      // Defaults applied when the DB column is null
      startingArmbandNumber: 100,
      defaultJudgeDayCapacity: 125,
    });

    const table = new TestableShowsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).toMatchObject({
      id: 'show-1',
      name: 'Spring Classic',
      organization: 'AKC',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      club_id: 'club-1',
      status: 'published',
      starting_armband_number: 100,
    });
  });

  it('shows: maps a legacy/unrecognized status to the "draft" DB fallback', () => {
    const domain = rowToShow({
      id: 'show-2',
      name: 'Unknown Status Show',
      organization: 'AKC',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
      status: 'some-unrecognized-status',
    } as never);

    const table = new TestableShowsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt.status).toBe('draft');
  });

  it('trials: maps optional fields and round-trips core identity fields', () => {
    const row = {
      id: 'trial-1',
      show_id: 'show-1',
      name: 'Saturday Trial',
      date: '2026-08-01',
      trial_number: '1',
      status: 'in_progress',
      max_entries_per_dog: 2,
      max_total_entries: 100,
      max_entries_per_handler: null,
      trial_type: 'regular',
      planned_start_time: null,
      actual_start_time: null,
      actual_end_time: null,
      event_number: null,
      display_order: 1,
      category: null,
      image_url: null,
      timezone: 'America/New_York',
      registry_id: 'AKC',
    };

    const domain = rowToTrial(row as never);
    expect(domain).toMatchObject({
      id: 'trial-1',
      showId: 'show-1',
      name: 'Saturday Trial',
      date: '2026-08-01',
      trialNumber: '1',
      status: 'in_progress',
      timezone: 'America/New_York',
      registryId: 'AKC',
    });

    const table = new TestableTrialsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt).toMatchObject({
      id: 'trial-1',
      show_id: 'show-1',
      name: 'Saturday Trial',
      date: '2026-08-01',
      trial_number: '1',
      status: 'in_progress',
      registry_id: 'AKC',
    });
  });

  it('trials: defaults registry_id to AKC on write-back when unset', () => {
    const domain = rowToTrial({
      id: 'trial-2',
      show_id: 'show-1',
      name: 'No Registry Trial',
      date: '2026-08-01',
      registry_id: null,
    } as never);

    const table = new TestableTrialsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    expect(rebuilt.registry_id).toBe('AKC');
  });

  it('judge assignments: maps embedded class/trial enrichment and round-trips writable fields', () => {
    const domain = rowToJudgeAssignment(makeJudgeAssignmentJoinedRow() as never);
    // showId/trialId fall back to the embedded trial when the assignment's
    // own columns are null.
    expect(domain).toMatchObject({
      id: 'assignment-1',
      personId: 'judge-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      status: 'confirmed',
      fee: 100,
      className: 'Novice Container',
      trialTimezone: 'America/New_York',
    });

    const table = new TestableJudgeAssignmentsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);
    // Enrichment fields are read-only and are NOT written back.
    expect(rebuilt).not.toHaveProperty('className');
    expect(rebuilt).toMatchObject({
      id: 'assignment-1',
      person_id: 'judge-1',
      show_id: 'show-1',
      trial_id: 'trial-1',
      class_id: 'class-1',
      status: 'confirmed',
      fee: 100,
      day_capacity_override: 50,
    });
  });

  it('judge assignments: omits day_capacity_override when the domain value is undefined (no clobber)', () => {
    // A replica cached before dayCapacityOverride was mapped lacks the key
    // entirely (`undefined`) — distinct from the explicit `null` that
    // rowToJudgeAssignment always produces when reading a fresh row.
    const domain = {
      id: 'assignment-2',
      personId: 'judge-1',
      showId: 'show-1',
      trialId: 'trial-1',
      classId: 'class-1',
      status: 'invited',
      invitedAt: null,
      confirmedAt: null,
      fee: null,
      notes: null,
      className: null,
      classElement: null,
      classLevel: null,
      classStatus: null,
      classStartTime: null,
      classCheckedInCount: null,
      classScoredCount: null,
      classTotalEntries: null,
      trialDate: null,
      trialTimezone: null,
      // dayCapacityOverride intentionally omitted (undefined)
    } as never;

    const table = new TestableJudgeAssignmentsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);

    expect(rebuilt).not.toHaveProperty('day_capacity_override');
  });

  it('judge assignments: writes an explicit null day_capacity_override (deliberate clear)', () => {
    const domain = rowToJudgeAssignment({
      id: 'assignment-3',
      person_id: 'judge-1',
      show_id: 'show-1',
      trial_id: 'trial-1',
      class_id: 'class-1',
      status: 'invited',
      invited_at: null,
      confirmed_at: null,
      fee: null,
      notes: null,
      day_capacity_override: null,
    } as never);

    const table = new TestableJudgeAssignmentsTable();
    const rebuilt = table.publicRebuildUpdatePayload(domain);

    expect(rebuilt).toHaveProperty('day_capacity_override', null);
  });

  it('classes: maps embedded judge_assignments into judgeName/judgeId', () => {
    const domain = rowToClass({
      id: 'class-1',
      trial_id: 'trial-1',
      name: 'Novice Container',
      status: 'scheduled',
      is_scoring_finalized: false,
      is_results_reviewed: false,
      results_released_at: null,
      results_released_by: null,
      deleted_at: null,
      judge_assignments: [
        {
          person_id: 'judge-1',
          people: { first_name: 'Jane', last_name: 'Doe' },
        },
      ],
    } as never);

    expect(domain.judgeId).toBe('judge-1');
    expect(domain.judgeName).toBe('Jane Doe');
    expect(domain.judgeFirstName).toBe('Jane');
    expect(domain.judgeLastName).toBe('Doe');
  });

  it('classes: leaves judge fields undefined when no judge_assignments are embedded', () => {
    const domain = rowToClass({
      id: 'class-2',
      trial_id: 'trial-1',
      name: 'Open Container',
      status: 'scheduled',
      is_scoring_finalized: false,
      is_results_reviewed: false,
      results_released_at: null,
      results_released_by: null,
      deleted_at: null,
      judge_assignments: [],
    } as never);

    expect(domain.judgeId).toBeUndefined();
    expect(domain.judgeName).toBeUndefined();
  });

  it('waitlist entries: maps join method and defaults status (read-only, no write-back path)', () => {
    const row = {
      id: 'waitlist-1',
      class_id: 'class-1',
      dog_id: 'dog-1',
      exhibitor_id: 'exhibitor-1',
      handler_id: null,
      position: 3,
      status: null,
      joined_via: 'mail_in',
      offered_at: null,
      offer_expires_at: null,
      created_at: '2026-06-01T09:00:00.000Z',
      updated_at: '2026-06-01T09:00:00.000Z',
    };

    const domain = rowToWaitlistEntry(row as never);
    expect(domain).toMatchObject({
      id: 'waitlist-1',
      classId: 'class-1',
      dogId: 'dog-1',
      position: 3,
      status: 'waiting', // defaulted when the row's status is null
      joinedVia: 'mail_in',
    });
  });

  it('waitlist entries: defaults joinedVia to online for any non "mail_in" value', () => {
    const domain = rowToWaitlistEntry({
      id: 'waitlist-2',
      class_id: 'class-1',
      dog_id: 'dog-2',
      exhibitor_id: 'exhibitor-2',
      handler_id: null,
      position: 1,
      status: 'offered',
      joined_via: 'online',
      offered_at: '2026-06-02T09:00:00.000Z',
      offer_expires_at: '2026-06-03T09:00:00.000Z',
      created_at: null,
      updated_at: null,
    } as never);

    expect(domain.joinedVia).toBe('online');
    expect(domain.status).toBe('offered');
  });
});
