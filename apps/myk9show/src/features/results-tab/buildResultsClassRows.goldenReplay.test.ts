// @vitest-environment node
/**
 * MYK9-1647 golden replay, results half: the real, published legacy trial
 * (supabase/tests/fixtures/golden-replay/legacy-trial-27835.json) goes through
 * the Results tab's row builder on the real `SecretaryEntry` input shape, and
 * what the builder displays is compared with what v3 published. The SQL half
 * (supabase/tests/golden_replay_trial_27835_test.sql) checks the placements the
 * server computes; this checks that the builder shows them, and the result
 * labels and counts, faithfully.
 *
 * Placements follow the same named rules as the SQL replay:
 *   RULE 1: a tie within 1st-4th matches when the SET of places matches.
 *   RULE 2: a tie below 4th matches when every member holds the group's best place.
 *   RULE 3: non-qualifiers show no placement.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { SecretaryEntry } from '@/services/database/entries';
import type { SyncableTrial, SyncableTrialClass } from '@/store/trial-store-types';
import { buildResultsClassRows, type ResultsClassRow } from './buildResultsClassRows';

interface FixtureEntry {
  armband: number;
  handler: string;
  dog: string;
  resultStatus: string;
  searchTimeSeconds: number;
  totalFaults: number;
  pointsEarned: number;
  finalPlacement: number | null;
}
interface FixtureClass {
  element: string;
  level: string;
  section: string;
  entries: FixtureEntry[];
}
interface Fixture {
  source: { trialDate: string };
  classes: FixtureClass[];
}

const fixture = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../../../supabase/tests/fixtures/golden-replay/legacy-trial-27835.json'
    ),
    'utf8'
  )
) as Fixture;

const SYNC = {
  _version: 1,
  _lastModified: new Date(0),
  _lastModifiedBy: '',
  _syncStatus: 'synced',
} as const;

const LABEL_BY_STATUS: Record<string, string> = {
  qualified: 'Q',
  nq: 'NQ',
  absent: 'ABS',
  excused: 'EXC',
};

const classId = (i: number) => `golden-class-${i}`;

/** The fixture as the secretary read carries it: every v3 entry was expected and scored. */
function toSecretaryEntries(
  classes: readonly FixtureClass[],
  overrideStatus?: { cls: number; armband: number; status: string }
): SecretaryEntry[] {
  return classes.flatMap((c, i) =>
    c.entries.map(
      e =>
        ({
          id: `golden-${i}-${e.armband}`,
          class_id: classId(i),
          entry_status: 'checked-in',
          check_in_status: 'checked-in',
          is_scored: true,
          result_status:
            overrideStatus?.cls === i && overrideStatus.armband === e.armband
              ? overrideStatus.status
              : e.resultStatus,
          armband: String(e.armband),
          final_placement: e.finalPlacement,
          search_time_seconds: e.searchTimeSeconds,
          total_faults: e.totalFaults,
          points_earned: e.pointsEarned,
          placement_tie: null,
          placement_tiebreak: null,
          dog: { id: `dog-${i}-${e.armband}`, name: e.dog, call_name: null },
          handler: null,
          handler_person: null,
          handler_identity: { name: e.handler, person: null, source: 'entered-text' },
        }) as unknown as SecretaryEntry
    )
  );
}

function build(entries: SecretaryEntry[]): ResultsClassRow[] {
  const trial = {
    id: 'golden-trial',
    showId: 'golden-show',
    showName: 'Golden Replay',
    trialDate: fixture.source.trialDate,
    trialNumber: '1',
    status: 'Completed',
    ...SYNC,
  } as SyncableTrial;
  const trialClassesList = fixture.classes.map(
    (c, i) =>
      ({
        id: classId(i),
        element: c.element,
        level: c.level,
        section: c.section,
        judgeId: 'judge-1',
        judgeName: 'Judge',
        startTime: '09:00',
        status: 'Completed',
        entries: c.entries.length,
        ...SYNC,
      }) as SyncableTrialClass
  );
  return buildResultsClassRows({
    trials: [trial],
    trialClasses: { 'golden-trial': trialClassesList },
    releasedAtByClassId: new Map(),
    paperworkByClassId: new Map(),
    entries,
  });
}

/**
 * Every disagreement between what a class row displays and what it was given.
 * The builder displays; it does not rank. Whether placements are RIGHT is the SQL
 * golden replay's job (supabase/tests/golden_replay_trial_27835_test.sql), so a
 * placement here is compared with the placement in the builder's input, while
 * labels, counts, display and order are compared with v3.
 */
function diffs(
  c: FixtureClass,
  ci: number,
  row: ResultsClassRow | undefined,
  inputPlacement: Map<string, number | null>
): string[] {
  if (!row) return [`class ${ci}: no row built`];
  const out: string[] = [];
  const shown = new Map(row.entries.map(r => [r.armband, r]));
  if (row.entries.length !== c.entries.length) {
    out.push(`class ${ci}: ${row.entries.length} entries displayed, v3 had ${c.entries.length}`);
  }
  const qualified = c.entries.filter(e => e.resultStatus === 'qualified');
  if (row.qualifiedCount !== qualified.length) {
    out.push(`class ${ci}: qualifiedCount ${row.qualifiedCount}, v3 ${qualified.length}`);
  }
  if (row.expectedCount !== c.entries.length || row.scoredCount !== c.entries.length) {
    out.push(
      `class ${ci}: expected/scored ${row.expectedCount}/${row.scoredCount}, v3 ${c.entries.length}`
    );
  }
  if (row.tieEntries.length !== qualified.length) {
    out.push(`class ${ci}: ${row.tieEntries.length} ranked entries, v3 ${qualified.length}`);
  }
  for (const e of c.entries) {
    const r = shown.get(String(e.armband));
    if (!r) {
      out.push(`class ${ci} armband ${e.armband}: not displayed`);
      continue;
    }
    if (r.resultLabel !== LABEL_BY_STATUS[e.resultStatus]) {
      out.push(`class ${ci} armband ${e.armband}: label ${r.resultLabel}, v3 ${e.resultStatus}`);
    }
    if (e.resultStatus !== 'qualified') {
      if (r.placement !== null)
        out.push(`class ${ci} armband ${e.armband}: non-qualifier placed ${r.placement}`);
      continue;
    }
    const given = inputPlacement.get(String(e.armband)) ?? null;
    if (r.placement !== given) {
      out.push(
        `class ${ci} armband ${e.armband}: displayed placement ${r.placement}, given ${given}`
      );
    }
  }
  // The list reads best place first, unplaced dogs last.
  const order = row.entries.map(r => r.placement);
  const placed = order.filter((p): p is number => p !== null);
  if (order.indexOf(null) !== -1 && order.slice(order.indexOf(null)).some(p => p !== null)) {
    out.push(`class ${ci}: an unplaced dog is listed above a placed one`);
  }
  if (placed.some((p, i) => i > 0 && p < (placed[i - 1] ?? 0))) {
    out.push(`class ${ci}: placements are not listed best first`);
  }
  return out;
}

const allDiffs = (entries: SecretaryEntry[]) => {
  const rows = build(entries);
  return fixture.classes.flatMap((c, i) => {
    const given = new Map(
      entries
        .filter(e => e.class_id === classId(i))
        .map(e => [String(e.armband), e.final_placement ?? null] as const)
    );
    return diffs(
      c,
      i,
      rows.find(r => r.id === classId(i)),
      given
    );
  });
};

describe('Results tab rows replayed from the real published v3 trial', () => {
  it('builds one row per class from the fixture', () => {
    const rows = build(toSecretaryEntries(fixture.classes));
    expect(rows).toHaveLength(fixture.classes.length);
    expect(rows.map(r => r.entries.length).reduce((a, b) => a + b, 0)).toBe(
      fixture.classes.reduce((n, c) => n + c.entries.length, 0)
    );
  });

  it('displays every entry with the v3 label and counts, and the placement it was given', () => {
    expect(allDiffs(toSecretaryEntries(fixture.classes))).toEqual([]);
  });

  it('covers every v3 result status and a tie, so the check is not vacuous', () => {
    const statuses = new Set(fixture.classes.flatMap(c => c.entries.map(e => e.resultStatus)));
    expect([...statuses].sort()).toEqual(['absent', 'excused', 'nq', 'qualified']);
  });

  it('negative control: flipping one result status in the input is reported', () => {
    const ci = fixture.classes.findIndex(c => c.entries.some(e => e.resultStatus === 'nq'));
    const nq = fixture.classes[ci]?.entries.find(e => e.resultStatus === 'nq');
    expect(nq).toBeDefined();
    const found = allDiffs(
      toSecretaryEntries(fixture.classes, {
        cls: ci,
        armband: nq?.armband ?? 0,
        status: 'qualified',
      })
    );
    expect(found.length).toBeGreaterThan(0);
    expect(found.join('\n')).toContain(`armband ${nq?.armband}: label Q, v3 nq`);
  });
});
