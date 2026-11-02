// Generates supabase/tests/golden_replay_trial_27835_test.sql from the committed
// golden-replay fixture. The SQL file is generated, never hand-edited:
//   pnpm exec tsx scripts/qa/golden-replay/build.ts           write it
//   pnpm exec tsx scripts/qa/golden-replay/build.ts --check   fail if it is stale
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GoldenFixture } from './types';
import { COMPARISON_SQL, HEADER_SQL, TAIL_SQL } from './sqlTemplates';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
export const FIXTURE_PATH = join(
  root,
  'supabase/tests/fixtures/golden-replay/legacy-trial-27835.json'
);
export const SQL_PATH = join(root, 'supabase/tests/golden_replay_trial_27835_test.sql');

const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`;
export const classKey = (c: { element: string; level: string; section: string }): string =>
  [c.element, c.level, c.section || '-'].join(' ');

export function buildSql(fx: GoldenFixture): string {
  const classRows = fx.classes.map(
    c =>
      `  (${lit(classKey(c))}, ${lit(c.element)}, ${lit(c.level)}, ${lit(c.section)}, ${c.timeLimitSeconds ?? 'NULL'}, ${c.areaCount})`
  );
  const entryRows = fx.classes.flatMap(c =>
    c.entries.map(
      e =>
        `  (${lit(classKey(c))}, ${lit(String(e.armband))}, ${lit(e.resultStatus)}, ${e.searchTimeSeconds}, ${e.totalFaults}, ${e.totalCorrectFinds}, ${e.totalIncorrectFinds}, ${e.area1TimeSeconds}, ${e.area1Correct}, ${e.area1Incorrect}, ${e.area1Faults}, ${e.timeOverLimit}, ${e.pointsEarned}, ${e.finalPlacement ?? 'NULL'})`
    )
  );
  const s = fx.source;
  return [
    HEADER_SQL(
      `${s.system} trial ${s.trialId} "${s.trialName}" (${s.trialDate}), exported ${s.exportedOn}, anonymised`
    ),
    `INSERT INTO pg_temp.golden_class (class_key, element, level, section, time_limit_seconds, num_areas) VALUES\n${classRows.join(',\n')};\n`,
    `INSERT INTO pg_temp.golden_expected (class_key, armband, result_status, search_time_seconds, total_faults, total_correct_finds, total_incorrect_finds, area1_time_seconds, area1_correct, area1_incorrect, area1_faults, time_over_limit, points_earned, v3_place) VALUES\n${entryRows.join(',\n')};\n`,
    COMPARISON_SQL,
    TAIL_SQL,
  ].join('\n');
}

/**
 * Known-answer copy of the fixture: the published places of the first untied
 * 1st and 2nd qualifier swapped. Replaying it must fail.
 */
export function swapFirstUntiedPair(fx: GoldenFixture): GoldenFixture {
  const copy = structuredClone(fx);
  for (const c of copy.classes) {
    const q = c.entries.filter(e => e.resultStatus === 'qualified');
    const untied = (place: number) => {
      const hit = q.filter(e => e.finalPlacement === place);
      const [only] = hit;
      if (hit.length !== 1 || !only) return undefined;
      const same = q.filter(
        e => e.totalFaults === only.totalFaults && e.searchTimeSeconds === only.searchTimeSeconds
      );
      return same.length === 1 ? only : undefined;
    };
    const first = untied(1);
    const second = untied(2);
    if (first && second) {
      first.finalPlacement = 2;
      second.finalPlacement = 1;
      return copy;
    }
  }
  throw new Error('golden replay fixture has no class with an untied 1st and 2nd to swap');
}

if (process.argv[1]?.endsWith('build.ts')) {
  const fx = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFixture;
  const swapOut = process.argv.indexOf('--swapped-out');
  if (swapOut > 0) {
    // Known-answer SQL for the runner's self-check; never committed.
    writeFileSync(process.argv[swapOut + 1] ?? '', buildSql(swapFirstUntiedPair(fx)));
    process.exit(0);
  }
  const sql = buildSql(fx);
  if (process.argv.includes('--check')) {
    if (readFileSync(SQL_PATH, 'utf8') !== sql) {
      console.error('golden_replay_trial_27835_test.sql is stale: run pnpm qa:golden-replay:build');
      process.exit(1);
    }
  } else {
    writeFileSync(SQL_PATH, sql);
  }
}
