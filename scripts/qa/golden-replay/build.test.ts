// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { anonymise } from './anonymise';
import { buildSql, FIXTURE_PATH, SQL_PATH, swapFirstUntiedPair } from './build';
import type { GoldenFixture } from './types';

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFixture;

function tieGroups(c: GoldenFixture['classes'][number]) {
  const groups = new Map<string, number[]>();
  for (const e of c.entries.filter(x => x.resultStatus === 'qualified')) {
    const k = `${e.totalFaults}|${e.searchTimeSeconds}`;
    groups.set(k, [...(groups.get(k) ?? []), e.finalPlacement ?? -1]);
  }
  return [...groups.values()].filter(g => g.length > 1);
}

describe('golden replay fixture', () => {
  it('is a real multi-class trial with ties and an NQ, and records its source', () => {
    expect(fixture.classes.length).toBeGreaterThanOrEqual(2);
    expect(fixture.classes.flatMap(tieGroups).length).toBeGreaterThan(0);
    expect(fixture.classes.flatMap(c => c.entries).some(e => e.resultStatus === 'nq')).toBe(true);
    expect(fixture.source).toMatchObject({
      system: 'legacy myK9Q v3',
      trialId: 27835,
      exportedOn: '2026-11-01',
      anonymised: true,
    });
    expect(fixture.source.replay).toContain('pnpm qa:golden-replay');
  });

  it('holds only pseudonymous names', () => {
    for (const e of fixture.classes.flatMap(c => c.entries)) {
      expect(e.handler).toMatch(/^Handler \d{3}$/);
      expect(e.dog).toMatch(/^Dog \d{3}$/);
    }
  });

  it('carries no field outside the scoring inputs and published outputs', () => {
    const allowed = [
      'armband',
      'handler',
      'dog',
      'resultStatus',
      'searchTimeSeconds',
      'totalFaults',
      'totalCorrectFinds',
      'totalIncorrectFinds',
      'area1TimeSeconds',
      'area1Correct',
      'area1Incorrect',
      'area1Faults',
      'timeOverLimit',
      'pointsEarned',
      'finalPlacement',
    ].sort();
    for (const e of fixture.classes.flatMap(c => c.entries)) {
      expect(Object.keys(e).sort()).toEqual(allowed);
    }
  });
});

describe('anonymise', () => {
  it('drops names and identifying fields from a raw export row', () => {
    const out = anonymise({
      trial: [{ trial_date: '2026-09-06' }],
      classes: [
        {
          id: 1,
          element: 'Container',
          level: 'Novice',
          section: 'A',
          time_limit_seconds: 120,
          area_count: 1,
          class_order: 1,
        },
      ],
      entries: [
        {
          class_id: 1,
          armband_number: 101,
          handler_name: 'Jane Secretfamily',
          dog_call_name: 'Rex Secretdog',
          license_key: 'myK9Q1-secret',
          result_status: 'qualified',
          search_time_seconds: 12.340000000000002,
          total_faults: 0,
          total_correct_finds: 1,
          total_incorrect_finds: 0,
          area1_time_seconds: 12.34,
          area1_correct: 1,
          area1_incorrect: 0,
          area1_faults: 0,
          time_over_limit: false,
          points_earned: 0,
          final_placement: 1,
        } as never,
      ],
    });
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/Secretfamily|Secretdog|myK9Q1-secret/);
    expect(out.classes[0]?.entries[0]).toMatchObject({
      handler: 'Handler 001',
      dog: 'Dog 001',
      searchTimeSeconds: 12.34,
    });
  });
});

describe('generated SQL', () => {
  it('matches the committed test file (run pnpm qa:golden-replay:build when this fails)', () => {
    expect(readFileSync(SQL_PATH, 'utf8')).toBe(buildSql(fixture));
  });

  it('swaps exactly two untied places for the known-answer self-check', () => {
    const swapped = swapFirstUntiedPair(fixture);
    const changed = fixture.classes.flatMap((c, ci) =>
      c.entries.filter(
        (e, i) => e.finalPlacement !== swapped.classes[ci]?.entries[i]?.finalPlacement
      )
    );
    expect(changed).toHaveLength(2);
    expect(changed.map(e => e.finalPlacement).sort()).toEqual([1, 2]);
    expect(buildSql(swapped)).not.toBe(buildSql(fixture));
  });

  it('names the two rule differences and both known-answer controls', () => {
    const sql = buildSql(fixture);
    for (const needle of [
      'RULE 1',
      'RULE 2',
      'RULE 3',
      'CONTROL A',
      'CONTROL B',
      'CONTROL C',
      'CONTROL D',
      'CONTROL E',
    ]) {
      expect(sql).toContain(needle);
    }
  });
});
