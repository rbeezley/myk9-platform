/**
 * MYK9-645 — the Ringside class list and the class page must count entries with
 * the canonical `entryAccounting` rule, not raw `entries.length` / `is_scored`.
 *
 * The rule is the server's auto-derivation (migration `20260712180000`,
 * MYK9-356): withdrawn / scratched / pulled / moved / not_accepted / absent
 * entries leave the expected set, and `absent` / `excused` results are
 * accounted for without a score. Counting raw rows leaves a finished class
 * reading `64 / 66` on the judge's landing screen while the server has it
 * complete.
 *
 * `_shared/entryAccounting` is the rule used here; the unrelated
 * `features/financial/entryAccounting` is a cent-based money projection.
 */
import { describe, expect, it } from 'vitest';
import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import { countEntryAccounting } from '@/features/_shared/entryAccounting';
import { refreshAtShowClassListEntries, toClassEntry } from './atShowClassListAdapter';
import type { AtShowClassGroup } from './atShowClassListAdapter';
import type { ReplicatedClass } from '@/services/replication/ReplicatedClassesTable';
import { buildClassInfo, transformEntry } from './atShowDataAdapter';

const CLASS_ID = 'class-interior-advanced';

function makeClass(): ReplicatedClass {
  return {
    id: CLASS_ID,
    name: 'Interior Advanced',
    element: 'Interior',
    level: 'Advanced',
  } as ReplicatedClass;
}

function entry(overrides: Partial<ReplicatedEntry>): ReplicatedEntry {
  return {
    id: overrides.id ?? 'entry',
    showId: 'show-1',
    classId: CLASS_ID,
    armband: '1',
    checkInStatus: 'checked-in',
    entryStatus: 'confirmed',
    isScored: false,
    runOrder: 1,
    ...overrides,
  } as ReplicatedEntry;
}

/**
 * A real-shaped class: 6 runners scored, 1 withdrawn, 1 pulled at check-in,
 * 1 moved to another class, 1 marked absent on the scoresheet. The server
 * counts 7 expected (6 scored + the absent result) and calls it complete.
 */
function realShapedEntries(): ReplicatedEntry[] {
  return [
    entry({ id: 'e1', armband: '1', isScored: true, resultStatus: 'qualified', runOrder: 1 }),
    entry({ id: 'e2', armband: '2', isScored: true, resultStatus: 'qualified', runOrder: 2 }),
    entry({ id: 'e3', armband: '3', isScored: true, resultStatus: 'nq', runOrder: 3 }),
    entry({ id: 'e4', armband: '4', isScored: true, resultStatus: 'qualified', runOrder: 4 }),
    entry({ id: 'e5', armband: '5', isScored: true, resultStatus: 'qualified', runOrder: 5 }),
    entry({ id: 'e6', armband: '6', isScored: true, resultStatus: 'excused', runOrder: 6 }),
    entry({ id: 'e7', armband: '7', isScored: false, resultStatus: 'absent', runOrder: 7 }),
    entry({ id: 'e8', armband: '8', entryStatus: 'withdrawn', isScored: false, runOrder: 8 }),
    entry({ id: 'e9', armband: '9', checkInStatus: 'pulled', isScored: false, runOrder: 9 }),
    entry({ id: 'e10', armband: '10', entryStatus: 'moved', isScored: false, runOrder: 10 }),
  ];
}

const SERVER = countEntryAccounting(realShapedEntries());

/**
 * A class where expected !== accounted, so numerator and denominator can be
 * told apart. 5 rows: 1 scored, 1 unscored, 1 `absent` RESULT (accounted
 * without a score), 1 `withdrawn`, 1 `pulled` at check-in.
 *
 * Server rule: expected 3, accounted 2. Every assertion below this point pins
 * those LITERALS -- not `countEntryAccounting(...)` -- because a fixture whose
 * two numbers are equal cannot catch a numerator/denominator swap.
 */
function asymmetricEntries(): ReplicatedEntry[] {
  return [
    entry({ id: 'a1', armband: '1', isScored: true, resultStatus: 'qualified', runOrder: 1 }),
    entry({ id: 'a2', armband: '2', isScored: false, runOrder: 2 }),
    entry({ id: 'a3', armband: '3', isScored: false, resultStatus: 'absent', runOrder: 3 }),
    entry({ id: 'a4', armband: '4', entryStatus: 'withdrawn', isScored: false, runOrder: 4 }),
    entry({ id: 'a5', armband: '5', checkInStatus: 'pulled', isScored: false, runOrder: 5 }),
  ];
}

const ASYMMETRIC_EXPECTED = 3;
const ASYMMETRIC_ACCOUNTED = 2;

describe('MYK9-645 — at-show entry counters follow the canonical accounting rule', () => {
  it('the fixture is the documented server shape (7 expected, 7 accounted, complete)', () => {
    expect(SERVER).toEqual({ expected: 7, accounted: 7, isComplete: true });
  });

  it('the class list card reports the accounted / expected pair, not raw rows', () => {
    const card = toClassEntry(makeClass(), realShapedEntries(), new Set());

    expect(card.entry_count).toBe(SERVER.expected);
    expect(card.completed_count).toBe(SERVER.accounted);
    expect(card.completed_count === card.entry_count).toBe(SERVER.isComplete);
  });

  it('the class list refresh path reports the same pair', () => {
    const groups: AtShowClassGroup[] = [
      {
        trial: { id: 'trial-1' } as never,
        classes: [toClassEntry(makeClass(), [], new Set())],
        nextUpByClassId: new Map(),
      },
    ];

    const [group] = refreshAtShowClassListEntries(groups, realShapedEntries(), 'show-1');
    const card = group?.classes[0];

    expect(card?.entry_count).toBe(SERVER.expected);
    expect(card?.completed_count).toBe(SERVER.accounted);
  });

  it('the class page reports the same pair as the class list', () => {
    const rawEntries = realShapedEntries();
    const cls = makeClass();
    const info = buildClassInfo(
      cls,
      null,
      rawEntries.map(re => transformEntry(re, cls)),
      rawEntries
    );

    expect(info.totalEntries).toBe(SERVER.expected);
    expect(info.completedEntries).toBe(SERVER.accounted);
  });

  it('the asymmetric fixture is 3 expected / 2 accounted by the server rule', () => {
    expect(countEntryAccounting(asymmetricEntries())).toEqual({
      expected: ASYMMETRIC_EXPECTED,
      accounted: ASYMMETRIC_ACCOUNTED,
      isComplete: false,
    });
  });

  it('the class list card puts accounted in the numerator and expected in the denominator', () => {
    const card = toClassEntry(makeClass(), asymmetricEntries(), new Set());

    expect(card.completed_count).toBe(2);
    expect(card.entry_count).toBe(3);
  });

  it('the class list refresh path puts accounted in the numerator and expected in the denominator', () => {
    const groups: AtShowClassGroup[] = [
      {
        trial: { id: 'trial-1' } as never,
        classes: [toClassEntry(makeClass(), [], new Set())],
        nextUpByClassId: new Map(),
      },
    ];

    const [group] = refreshAtShowClassListEntries(groups, asymmetricEntries(), 'show-1');
    const card = group?.classes[0];

    expect(card?.completed_count).toBe(2);
    expect(card?.entry_count).toBe(3);
  });

  it('the class page puts accounted in the numerator and expected in the denominator', () => {
    const rawEntries = asymmetricEntries();
    const cls = makeClass();
    const info = buildClassInfo(
      cls,
      null,
      rawEntries.map(re => transformEntry(re, cls)),
      rawEntries
    );

    expect(info.completedEntries).toBe(2);
    expect(info.totalEntries).toBe(3);
  });

  it('hands the ringside Pending / Completed tabs the same pair as the header', () => {
    const rawEntries = asymmetricEntries();
    const cls = makeClass();
    const info = buildClassInfo(
      cls,
      null,
      rawEntries.map(re => transformEntry(re, cls)),
      rawEntries
    );

    // pending = expected - accounted, completed = accounted. One screen, one pair.
    expect(info.statusCounts).toEqual({ pending: 1, completed: 2 });
    expect((info.statusCounts?.pending ?? 0) + (info.statusCounts?.completed ?? 0)).toBe(
      info.totalEntries
    );
    expect(info.statusCounts?.completed).toBe(info.completedEntries);
  });

  it('a soft-deleted row is out of both numbers', () => {
    const rows = [
      ...realShapedEntries(),
      entry({ id: 'e11', armband: '11', deletedAt: '2026-09-17T00:00:00Z', runOrder: 11 }),
    ];
    const card = toClassEntry(makeClass(), rows, new Set());

    expect(card.entry_count).toBe(SERVER.expected);
    expect(card.completed_count).toBe(SERVER.accounted);
  });
});
