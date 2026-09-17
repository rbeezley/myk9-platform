/**
 * MYK9-645 round 5 — the equivalences, asserted over the WHOLE grid.
 *
 * Three rounds of this issue each fixed one branch of "is this dog going to
 * run?" and left a sibling standing: `moved` stayed in the run order after the
 * counts dropped it; then an unscored `absent`-RESULT row stayed in the order
 * after being counted as accounted; then a withdrawn row with a stale
 * `check_in_status: 'in-ring'` was announced as the dog in the ring while
 * listed under Not running. Each was found by a reader, not by a test, because
 * every test named one example (LESSONS `discriminator-branches`).
 *
 * So this file does not name examples. It walks every
 * entry_status x result_status x check_in_status x is_scored combination the
 * database can hold and asserts the invariants that make one rule one rule:
 *
 *   pending     <=> isRunnableEntry
 *   completed   <=> expected AND accounted
 *   not_running <=> NOT expected
 *   in the run queue      <=> isRunnableEntry
 *   announced as in-ring  ==> isRunnableEntry
 */
import { describe, it, expect } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import {
  classifyEntry,
  countEntryAccounting,
  isAccountedFor,
  isExpectedEntry,
  isRunnableEntry,
} from '../entryAccounting';
import {
  inRingReplicated,
  pendingReplicatedByRunOrder,
} from '@/features/at-show/replicatedRunQueue';

/** Every value `entries_entry_status_check` permits. */
const ENTRY_STATUSES = [
  'no-status',
  'draft',
  'submitted',
  'paid',
  'confirmed',
  'checked-in',
  'at-gate',
  'in-ring',
  'competing',
  'completed',
  'withdrawn',
  'scratched',
  'absent',
  'moved',
  'not_accepted',
  'pending-payment',
  'promotion-expired',
  'scratch-requested',
  'move-up-requested',
] as const;

/** The show-day axis, where `pulled` and `in-ring` actually live. */
const CHECK_IN_STATUSES = [
  undefined,
  'no-status',
  'checked-in',
  'at-gate',
  'come-to-gate',
  'in-ring',
  'pulled',
  'conflict',
] as const;

const RESULT_STATUSES = [undefined, 'pending', 'qualified', 'nq', 'absent', 'excused'] as const;

interface Combination {
  label: string;
  row: ReplicatedEntry;
}

function grid(): Combination[] {
  const combos: Combination[] = [];
  let n = 0;
  for (const entryStatus of ENTRY_STATUSES) {
    for (const checkInStatus of CHECK_IN_STATUSES) {
      for (const resultStatus of RESULT_STATUSES) {
        for (const isScored of [false, true]) {
          n += 1;
          combos.push({
            label: `entry_status=${entryStatus} check_in=${checkInStatus ?? '(unset)'} result=${resultStatus ?? '(unset)'} scored=${isScored}`,
            row: {
              id: `e${n}`,
              classId: 'class-1',
              armband: String(100 + (n % 900)),
              runOrder: n,
              entryStatus,
              isScored,
              ...(checkInStatus ? { checkInStatus } : {}),
              ...(resultStatus ? { resultStatus } : {}),
            } as ReplicatedEntry,
          });
        }
      }
    }
  }
  return combos;
}

const GRID = grid();

describe('entry accounting — one rule across the whole status grid (MYK9-645)', () => {
  it('covers the real cardinality of the grid', () => {
    expect(GRID).toHaveLength(
      ENTRY_STATUSES.length * CHECK_IN_STATUSES.length * RESULT_STATUSES.length * 2
    );
  });

  it('classifies pending exactly where the row is runnable', () => {
    const mismatches = GRID.filter(
      ({ row }) => (classifyEntry(row) === 'pending') !== isRunnableEntry(row)
    ).map(c => c.label);
    expect(mismatches).toEqual([]);
  });

  it('classifies completed exactly where the row is expected and accounted', () => {
    const mismatches = GRID.filter(
      ({ row }) =>
        (classifyEntry(row) === 'completed') !== (isExpectedEntry(row) && isAccountedFor(row))
    ).map(c => c.label);
    expect(mismatches).toEqual([]);
  });

  it('classifies not_running exactly where the row is not expected', () => {
    const mismatches = GRID.filter(
      ({ row }) => (classifyEntry(row) === 'not_running') !== !isExpectedEntry(row)
    ).map(c => c.label);
    expect(mismatches).toEqual([]);
  });

  it('puts a row in the run queue exactly when it is runnable', () => {
    // One row at a time: `pendingReplicatedByRunOrder` also drops the in-ring
    // dog from the WAITING list, which is an ordering rule, not membership --
    // so membership is read as "queued or announced in the ring".
    const mismatches = GRID.filter(({ row }) => {
      const queued = pendingReplicatedByRunOrder([row]).length === 1;
      const inRing = inRingReplicated([row]) !== null;
      return queued || inRing ? !isRunnableEntry(row) : isRunnableEntry(row);
    }).map(c => c.label);
    expect(mismatches).toEqual([]);
  });

  it('never announces a non-runnable row as the dog in the ring', () => {
    const mismatches = GRID.filter(
      ({ row }) => inRingReplicated([row]) !== null && !isRunnableEntry(row)
    ).map(c => c.label);
    expect(mismatches).toEqual([]);
  });

  it('counts expected and accounted consistently with the classification', () => {
    const counts = countEntryAccounting(GRID.map(c => c.row));
    const groups = GRID.map(c => classifyEntry(c.row));

    expect(counts.expected).toBe(groups.filter(g => g !== 'not_running').length);
    expect(counts.accounted).toBe(groups.filter(g => g === 'completed').length);
    expect(counts.expected - counts.accounted).toBe(groups.filter(g => g === 'pending').length);
  });
});
