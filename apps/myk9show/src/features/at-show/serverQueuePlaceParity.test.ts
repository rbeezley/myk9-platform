import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rowToEntry, type EntryRow } from '@/services/replication/ReplicatedEntriesTable.mapper';
import { pendingReplicatedByRunOrder } from './replicatedRunQueue';

/**
 * MYK9-995: the server's place in line (get_my_entry_queue_places) and the
 * ringside run queue must name the same place for every row.
 *
 * Both are judged on ONE fixture: the `$fixture$` block in the behavioral SQL
 * test, which CI loads into `entries` and runs the installed RPC over. Here the
 * same rows go through the real ringside chain a replicated row takes
 * (rowToEntry -> toRunQueueEntry -> pendingByRunOrder) and must produce the
 * same `expected`. Neither side reads the other's predicate; a waiting rule
 * changed on one side turns that side's test red.
 */

interface FixtureRow {
  key: string;
  class: string;
  armband: string | null;
  run_order: number | null;
  is_scored?: boolean;
  is_in_ring?: boolean;
  check_in_status?: string | null;
  entry_status?: string;
  result_status?: string;
  deleted?: boolean;
  expected: number | null;
}

const SQL_TEST = resolve(
  __dirname,
  '../../../../../supabase/tests/myk9_995_my_entry_queue_places_test.sql'
);

function loadFixture(): FixtureRow[] {
  const sql = readFileSync(SQL_TEST, 'utf8');
  const match = /jsonb_array_elements\(\$fixture\$([\s\S]*?)\$fixture\$::jsonb\)/.exec(sql);
  if (!match?.[1]) throw new Error('no $fixture$ block in the SQL test');
  return JSON.parse(match[1]) as FixtureRow[];
}

/** The `entries` row the SQL test inserts for a fixture row (same defaults). */
function toEntryRow(row: FixtureRow): EntryRow {
  return {
    id: row.key,
    class_id: row.class,
    armband: row.armband,
    run_order: row.run_order,
    is_scored: row.is_scored ?? false,
    is_in_ring: row.is_in_ring ?? false,
    check_in_status: 'check_in_status' in row ? (row.check_in_status ?? null) : 'no-status',
    entry_status: row.entry_status ?? 'confirmed',
    result_status: row.result_status ?? 'pending',
    deleted_at: row.deleted ? '2026-10-05T00:00:00Z' : null,
  } as unknown as EntryRow;
}

/** The place an owner is shown: null unless waiting with its own order set. */
function ringsidePlaces(rows: FixtureRow[]): Map<string, number | null> {
  const places = new Map<string, number | null>();
  const byClass = new Map<string, FixtureRow[]>();
  for (const row of rows) byClass.set(row.class, [...(byClass.get(row.class) ?? []), row]);
  for (const classRows of byClass.values()) {
    const queue = pendingReplicatedByRunOrder(classRows.map(row => rowToEntry(toEntryRow(row))));
    for (const row of classRows) {
      const index = queue.findIndex(entry => entry.id === row.key);
      places.set(row.key, index >= 0 && row.run_order ? index + 1 : null);
    }
  }
  return places;
}

describe('server place in line matches the ringside queue (shared fixture)', () => {
  const fixture = loadFixture();
  const places = ringsidePlaces(fixture);

  it('loads a fixture that exercises every waiting rule', () => {
    expect(fixture.length).toBeGreaterThanOrEqual(20);
    // Absolute anchors, so a shared mistake on both sides cannot pass.
    expect(fixture.filter(row => row.expected !== null).map(row => row.expected)).toEqual([
      4, 2, 5, 6, 7, 8, 9, 11, 10, 12, 13, 1,
    ]);
  });

  for (const row of fixture) {
    it(`${row.key} -> ${row.expected ?? 'no place'}`, () => {
      expect(places.get(row.key)).toBe(row.expected);
    });
  }
});
