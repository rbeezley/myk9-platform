import { describe, it, expect } from 'vitest';
import { rowToEntry, ReplicatedEntriesTable } from './ReplicatedEntriesTable';
import type { ReplicatedEntry } from './ReplicatedEntriesTable.mapper';
import { RINGSIDE_RPC_FUNCTION } from './ringsideEntryRpc';

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

// Expose the protected repair-RPC builder for testing.
class TestableEntriesTable extends ReplicatedEntriesTable {
  publicBuildRepairRpc(entry: ReplicatedEntry, payload: Record<string, unknown>) {
    return this.buildRepairRpc(entry, payload);
  }
}

describe('ReplicatedEntriesTable.buildRepairRpc — ringside projection', () => {
  const table = new TestableEntriesTable('entries');

  it('routes a FULL-row repair payload through the ringside RPC with ONLY ringside fields', () => {
    // rebuildUpdatePayload returns a full row: ringside + non-ringside columns.
    const fullRow = {
      id: 'entry-1',
      // non-ringside (would make buildRingsideRpcFields return null if not projected)
      entry_status: 'entered',
      armband: 100,
      class_id: 'class-1',
      show_id: 'show-1',
      updated_at: '2026-07-09T00:00:00Z',
      // ringside scoring columns
      is_scored: true,
      result_status: 'qualified',
      area1_time_seconds: 45,
      total_correct_finds: 3,
      points_earned: 95,
    };

    const rpc = table.publicBuildRepairRpc({ id: 'entry-1' } as ReplicatedEntry, fullRow);

    // Must engage the RPC (not fall back to the RLS-denied direct UPDATE).
    expect(rpc).toBeDefined();
    expect(rpc!.name).toBe(RINGSIDE_RPC_FUNCTION);
    // Only ringside columns in the fields — non-ringside columns projected out.
    expect(rpc!.fields).toMatchObject({
      is_scored: true,
      result_status: 'qualified',
      area1_time_seconds: 45,
      total_correct_finds: 3,
      points_earned: 95,
    });
    expect(rpc!.fields).not.toHaveProperty('entry_status');
    expect(rpc!.fields).not.toHaveProperty('armband');
    expect(rpc!.fields).not.toHaveProperty('class_id');
  });

  it('returns undefined (direct UPDATE) when a payload has no ringside columns', () => {
    const rpc = table.publicBuildRepairRpc({ id: 'entry-1' } as ReplicatedEntry, {
      id: 'entry-1',
      entry_status: 'withdrawn',
      armband: 100,
    });
    expect(rpc).toBeUndefined();
  });
});
