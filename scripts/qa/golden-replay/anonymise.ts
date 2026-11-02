// Turns a raw legacy myK9Q v3 trial export (trial.json, classes.json,
// entries.json) into the committed golden-replay fixture. The raw export is
// never committed; this keeps only scoring inputs and published outputs, and
// replaces every handler and dog name with a numbered pseudonym.
//
//   pnpm exec tsx scripts/qa/golden-replay/anonymise.ts <raw-dir> [out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GoldenClass, GoldenEntry, GoldenFixture } from './types';

interface RawEntry {
  class_id: number;
  armband_number: number;
  result_status: string;
  search_time_seconds: number | null;
  total_faults: number | null;
  total_correct_finds: number | null;
  total_incorrect_finds: number | null;
  area1_time_seconds: number | null;
  area1_correct: number | null;
  area1_incorrect: number | null;
  area1_faults: number | null;
  time_over_limit: boolean | null;
  points_earned: number | null;
  final_placement: number | null;
}

interface RawClass {
  id: number;
  element: string;
  level: string;
  section: string;
  time_limit_seconds: number | null;
  area_count: number;
  class_order: number;
}

// The export carries float noise (0.620000000000001); times are centiseconds.
const cs = (n: number | null): number => Math.round((n ?? 0) * 100) / 100;
const int = (n: number | null): number => n ?? 0;
const pad = (n: number): string => String(n).padStart(3, '0');

export function anonymise(raw: {
  trial: unknown[];
  classes: RawClass[];
  entries: RawEntry[];
}): GoldenFixture {
  const trial = raw.trial[0] as { trial_date: string };
  const classes: GoldenClass[] = [...raw.classes]
    .sort((a, b) => a.class_order - b.class_order)
    .map(c => {
      const section = c.section === '-' ? '' : c.section;
      const entries: GoldenEntry[] = raw.entries
        .filter(e => e.class_id === c.id)
        .sort((a, b) => a.armband_number - b.armband_number)
        .map((e, i) => ({
          armband: e.armband_number,
          handler: `Handler ${pad(i + 1)}`,
          dog: `Dog ${pad(i + 1)}`,
          resultStatus: e.result_status,
          searchTimeSeconds: cs(e.search_time_seconds),
          totalFaults: int(e.total_faults),
          totalCorrectFinds: int(e.total_correct_finds),
          totalIncorrectFinds: int(e.total_incorrect_finds),
          area1TimeSeconds: cs(e.area1_time_seconds),
          area1Correct: int(e.area1_correct),
          area1Incorrect: int(e.area1_incorrect),
          area1Faults: int(e.area1_faults),
          timeOverLimit: e.time_over_limit === true,
          pointsEarned: int(e.points_earned),
          finalPlacement: e.final_placement ? e.final_placement : null,
        }));
      return {
        element: c.element,
        level: c.level,
        section,
        timeLimitSeconds: c.time_limit_seconds,
        areaCount: c.area_count,
        entries,
      };
    });
  return {
    source: {
      system: 'legacy myK9Q v3',
      trialId: 27835,
      accessTrialId: 191,
      showId: 548,
      trialName: 'Sun Sept 6, 2026 Trial 1',
      trialDate: trial.trial_date,
      exportedOn: '2026-11-01',
      anonymised: true,
      note: 'Every class was scoring-finalized in v3. final_placement is the v3 published result. Handler and dog names are pseudonyms; judge, breed, state, notes, signatures, license keys and timestamps are dropped. Times are rounded to 0.01s (export float noise).',
      replay:
        'pnpm qa:golden-replay (builds supabase/tests/golden_replay_trial_27835_test.sql from this file and runs it on a throwaway local Supabase stack); CI runs the same file in the behavioral SQL job.',
    },
    classes,
  };
}

if (process.argv[1]?.endsWith('anonymise.ts')) {
  const dir = process.argv[2];
  if (!dir) throw new Error('usage: anonymise.ts <raw-dir> [out.json]');
  const read = (f: string) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const out = process.argv[3] ?? 'supabase/tests/fixtures/golden-replay/legacy-trial-27835.json';
  const fixture = anonymise({
    trial: read('trial.json'),
    classes: read('classes.json'),
    entries: read('entries.json'),
  });
  writeFileSync(out, JSON.stringify(fixture, null, 1) + '\n');
}
