import { describe, it, expect } from 'vitest';
import { rowToEntry, ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';

/**
 * Regression: the entries sync embeds `dogs(call_name, breed)` so entry cards
 * can show the dog. Before the fix the sync selected `entries.*` only, so
 * `dogCallName`/`dogBreed` were always undefined and /at-show cards rendered
 * blank names. These assert the embedded to-one dog flows into the replica.
 */
describe('rowToEntry — embedded dog mapping', () => {
  const baseRow = {
    id: 'entry-1',
    class_id: 'class-1',
    show_id: 'show-1',
    dog_id: 'dog-1',
    armband: 100,
    handler: 'Test Secretary',
  };

  it('maps embedded dogs.call_name / breed into dogCallName / dogBreed', () => {
    const entry = rowToEntry({
      ...baseRow,
      dogs: { call_name: 'Max', breed: 'Mixed Breed' },
    } as never);

    expect(entry.dogCallName).toBe('Max');
    expect(entry.dogBreed).toBe('Mixed Breed');
    // Snake_case compatibility aliases must match too (adapter reads either).
    expect(entry.dog_call_name).toBe('Max');
    expect(entry.dog_breed).toBe('Mixed Breed');
  });

  it('maps embedded dogs.owner_id into dogOwnerId for handler identity projection', () => {
    const entry = rowToEntry({
      ...baseRow,
      dogs: { owner_id: 'owner-1', call_name: 'Max', breed: 'Mixed Breed' },
    } as never);

    expect(entry.dogOwnerId).toBe('owner-1');
  });

  it('leaves dog fields undefined when no dog is embedded', () => {
    const entry = rowToEntry({ ...baseRow, dogs: null } as never);

    expect(entry.dogCallName).toBeUndefined();
    expect(entry.dogBreed).toBeUndefined();
  });

  it('still maps armband and handler from the entry row', () => {
    const entry = rowToEntry({
      ...baseRow,
      dogs: { call_name: 'Luna', breed: 'Akita' },
    } as never);

    expect(entry.armband).toBe(100);
    expect(entry.handler).toBe('Test Secretary');
  });

  it('maps total_score into replicated score aliases', () => {
    const entry = rowToEntry({
      ...baseRow,
      total_score: 87.5,
    } as never);

    expect(entry.totalScore).toBe(87.5);
    expect(entry.totalPoints).toBe(87.5);
    expect(entry.total_score).toBe(87.5);
    expect(entry.total_points).toBe(87.5);
  });

  // Read-back for the detailed scent-work columns is what stops a full-row direct
  // UPDATE from nulling server values it didn't intend to change.
  it('maps detailed scent-work scoring columns back from the server row', () => {
    const entry = rowToEntry({
      ...baseRow,
      area1_time_seconds: 45,
      area2_time_seconds: 30,
      total_correct_finds: 3,
      total_incorrect_finds: 1,
      no_finish_count: 0,
      points_earned: 95,
    } as never);

    expect(entry.area1_time_seconds).toBe(45);
    expect(entry.area2_time_seconds).toBe(30);
    expect(entry.total_correct_finds).toBe(3);
    expect(entry.total_incorrect_finds).toBe(1);
    expect(entry.no_finish_count).toBe(0);
    expect(entry.points_earned).toBe(95);
  });
});

// Expose the private Supabase-row serializer for testing.
class TestableEntriesTable extends ReplicatedEntriesTable {
  publicToSupabaseRow(entry: ReplicatedEntry): Record<string, unknown> {
    // rebuildUpdatePayload is a thin public-ish override that calls toSupabaseRow.
    return this.rebuildUpdatePayload(entry);
  }
}

describe('toSupabaseRow — detailed scoring columns are conditional', () => {
  const table = new TestableEntriesTable();

  it('OMITS detail columns a stale cached row does not have (no null-clobber)', () => {
    // A replica cached before these fields were mapped lacks the properties.
    const row = table.publicToSupabaseRow({ id: 'entry-1', armband: '100' } as ReplicatedEntry);

    // Must NOT appear as null — a full-row UPDATE would otherwise wipe the
    // server's real area times/points.
    expect(row).not.toHaveProperty('area1_time_seconds');
    expect(row).not.toHaveProperty('total_correct_finds');
    expect(row).not.toHaveProperty('points_earned');
  });

  it('INCLUDES detail columns the row has, including a real 0', () => {
    const row = table.publicToSupabaseRow({
      id: 'entry-1',
      area1_time_seconds: 45,
      no_finish_count: 0,
      points_earned: 95,
    } as ReplicatedEntry);

    expect(row.area1_time_seconds).toBe(45);
    expect(row.no_finish_count).toBe(0); // 0 is a value, not "absent"
    expect(row.points_earned).toBe(95);
  });

  it('INCLUDES an explicit null (a deliberate clear)', () => {
    const row = table.publicToSupabaseRow({
      id: 'entry-1',
      area1_time_seconds: null,
    } as ReplicatedEntry);

    expect(row).toHaveProperty('area1_time_seconds', null);
  });
});

/**
 * MYK9-632: the enumerated withdrawal reason has to survive the round trip
 * through the replica, or the Edit Entry sheet goes back to a read of its own
 * and the badge disagrees with the card behind it.
 */
describe('withdrawal_reason_code through the replica (MYK9-632)', () => {
  const table = new TestableEntriesTable();

  it('carries the code off the replication view onto the replicated row', () => {
    const entry = rowToEntry({
      id: 'entry-1',
      entry_status: 'withdrawn',
      withdrawal_reason_code: 'in_season',
    } as never);

    expect(entry.withdrawalReasonCode).toBe('in_season');
    expect(entry.withdrawal_reason_code).toBe('in_season');
  });

  it('reads as undefined while migration 20260918041700 is unpushed', () => {
    // The view simply does not return the column yet, so the row arrives
    // without it. That must read as "no reason to show", never as a crash and
    // never as some other act.
    const entry = rowToEntry({ id: 'entry-1', entry_status: 'withdrawn' } as never);

    expect(entry.withdrawalReasonCode).toBeUndefined();
  });

  it('OMITS the column from a whole-row upload when the cached row lacks it', () => {
    // The wart this replaces was real: a full-row payload carrying
    // `withdrawal_reason_code: null` would wipe the server's stored reason on
    // the next unrelated edit of a row cached before the migration.
    const row = table.publicToSupabaseRow({ id: 'entry-1', armband: '100' } as ReplicatedEntry);

    expect(row).not.toHaveProperty('withdrawal_reason_code');
  });

  it('INCLUDES the code the row has, and an explicit null (a pull clearing it)', () => {
    expect(
      table.publicToSupabaseRow({
        id: 'entry-1',
        withdrawalReasonCode: 'judge_change',
      } as ReplicatedEntry).withdrawal_reason_code
    ).toBe('judge_change');

    expect(
      table.publicToSupabaseRow({
        id: 'entry-1',
        withdrawal_reason_code: null,
      } as ReplicatedEntry)
    ).toHaveProperty('withdrawal_reason_code', null);
  });
});

/**
 * MYK9-639: the supersession link has to survive the round trip, or the reverse
 * move (MYK9-640) has nothing durable to read and the Financial Report has no
 * way to tell a superseded source from a live entry.
 */
describe('moved_from_entry_id through the replica (MYK9-639)', () => {
  const table = new TestableEntriesTable();

  it('carries the link off the replication view onto the replicated row', () => {
    const entry = rowToEntry({
      id: 'dest-1',
      entry_status: 'confirmed',
      moved_from_entry_id: 'source-1',
    } as never);

    expect(entry.movedFromEntryId).toBe('source-1');
    expect(entry.moved_from_entry_id).toBe('source-1');
  });

  it('reads as undefined while migration 20260918193300 is unpushed', () => {
    const entry = rowToEntry({ id: 'dest-1', entry_status: 'confirmed' } as never);

    expect(entry.movedFromEntryId).toBeUndefined();
  });

  it('OMITS the column from a whole-row upload when the cached row lacks it', () => {
    const row = table.publicToSupabaseRow({ id: 'dest-1', armband: '100' } as ReplicatedEntry);

    expect(row).not.toHaveProperty('moved_from_entry_id');
  });

  it('INCLUDES the link when the row carries one', () => {
    const row = table.publicToSupabaseRow({
      id: 'dest-1',
      movedFromEntryId: 'source-1',
    } as ReplicatedEntry);

    expect(row).toMatchObject({ moved_from_entry_id: 'source-1' });
  });

  it('never emits comp or discount on a whole-row upload, even when the row has them', () => {
    // They were only ever added to carry money onto a move-up destination. Money
    // no longer moves, and emitting them here made columns that were previously
    // never written last-write-wins from any replica: a device holding a
    // pre-comp row could silently revert a comp set elsewhere on its next
    // unrelated check-in.
    const row = table.publicToSupabaseRow({
      id: 'dest-1',
      comped: true,
      compedReason: 'Club volunteer',
      discountAmount: 5,
    } as ReplicatedEntry);

    expect(row).not.toHaveProperty('comped');
    expect(row).not.toHaveProperty('comped_reason');
    expect(row).not.toHaveProperty('discount_amount');
  });

  it('omits an explicitly NULL link rather than unlinking a move-up someone else made', () => {
    expect(
      table.publicToSupabaseRow({ id: 'dest-1', movedFromEntryId: null } as ReplicatedEntry)
    ).not.toHaveProperty('moved_from_entry_id');
  });
});
