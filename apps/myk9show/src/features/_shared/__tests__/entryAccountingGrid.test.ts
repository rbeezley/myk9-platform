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

/**
 * The live CHECK constraints, pasted verbatim so a constraint change shows up
 * as a diff in this file rather than as a grid that quietly stops covering it.
 *
 * Captured 2026-09-17 from the `myk9-platform` project (`sojmvhhwsjxmfistvzbe`):
 *
 *   select conname, pg_get_constraintdef(oid)
 *   from pg_constraint
 *   where conrelid = 'public.entries'::regclass and contype = 'c';
 *
 * Handwritten arrays had already drifted from these by four values --
 * `scratch_requested` / `move_up_requested` (the underscore twins of the hyphen
 * forms), `check_in_status: 'completed'` and `result_status: 'withdrawn'` --
 * which is exactly the drift this grid exists to catch, so they are parsed out
 * of the constraint text instead of retyped.
 */
const ENTRY_STATUS_CHECK = `CHECK ((entry_status = ANY (ARRAY['no-status'::text, 'draft'::text, 'submitted'::text, 'paid'::text, 'confirmed'::text, 'checked-in'::text, 'at-gate'::text, 'in-ring'::text, 'competing'::text, 'completed'::text, 'withdrawn'::text, 'scratched'::text, 'absent'::text, 'moved'::text, 'not_accepted'::text, 'pending-payment'::text, 'promotion-expired'::text, 'scratch-requested'::text, 'scratch_requested'::text, 'move-up-requested'::text, 'move_up_requested'::text])))`;

const CHECK_IN_STATUS_CHECK = `CHECK ((check_in_status = ANY (ARRAY['no-status'::text, 'checked-in'::text, 'conflict'::text, 'pulled'::text, 'at-gate'::text, 'come-to-gate'::text, 'in-ring'::text, 'completed'::text])))`;

const RESULT_STATUS_CHECK = `CHECK ((result_status = ANY (ARRAY['pending'::text, 'qualified'::text, 'nq'::text, 'absent'::text, 'excused'::text, 'withdrawn'::text])))`;

/** Every `'value'::text` literal in a CHECK ... = ANY (ARRAY[...]) definition. */
function allowedValues(constraintDef: string): string[] {
  return [...constraintDef.matchAll(/'([^']*)'::text/g)].map(match => match[1] as string);
}

const ENTRY_STATUSES = allowedValues(ENTRY_STATUS_CHECK);

/**
 * The show-day axis, where `pulled` and `in-ring` actually live. `undefined`
 * leads: both nullable columns are unset on most real rows, and "unset" is a
 * case the predicates must handle, not a value the constraint lists.
 */
const CHECK_IN_STATUSES: (string | undefined)[] = [
  undefined,
  ...allowedValues(CHECK_IN_STATUS_CHECK),
];

const RESULT_STATUSES: (string | undefined)[] = [undefined, ...allowedValues(RESULT_STATUS_CHECK)];

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
  it('parses the live constraint text rather than a handwritten list', () => {
    // Known-answer check on the parser itself: an unparsed constraint would
    // silently shrink the grid to nothing and every invariant below would pass.
    expect(ENTRY_STATUSES).toHaveLength(21);
    expect(ENTRY_STATUSES).toEqual(
      expect.arrayContaining(['scratch_requested', 'move_up_requested'])
    );
    expect(CHECK_IN_STATUSES).toHaveLength(9); // 8 permitted values + unset
    expect(CHECK_IN_STATUSES).toContain('completed');
    expect(RESULT_STATUSES).toHaveLength(7); // 6 permitted values + unset
    expect(RESULT_STATUSES).toContain('withdrawn');
  });

  it('covers the real cardinality of the grid', () => {
    expect(GRID).toHaveLength(
      ENTRY_STATUSES.length * CHECK_IN_STATUSES.length * RESULT_STATUSES.length * 2
    );
    expect(GRID).toHaveLength(2646);
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
