import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  formatResidence,
  premiumTrialJudges,
  type PremiumJudgeAssignmentRow,
  type PremiumTrialClassRow,
} from './trialJudges.ts';

const donovan = {
  id: 'p-1',
  first_name: 'Pat',
  last_name: 'Donovan',
  city: 'Demoville',
  state: 'KS',
};
const kerr = { id: 'p-2', first_name: 'Sam', last_name: 'Kerr', city: null, state: 'IL' };

const classes: PremiumTrialClassRow[] = [
  { id: 'c-buried', element: 'Buried', level: 'Master', section: null },
  { id: 'c-cont-a', element: 'Container', level: 'Novice', section: 'A' },
  { id: 'c-cont-b', element: 'Container', level: 'Novice', section: 'B' },
  { id: 'c-int', element: 'Interior', level: 'Advanced', section: null },
];
const trial = { id: 't-2', classes };

const row = (
  people: PremiumJudgeAssignmentRow['people'],
  class_id: string | null,
  extra: Partial<PremiumJudgeAssignmentRow> = {}
): PremiumJudgeAssignmentRow => ({
  trial_id: 't-2',
  class_id,
  status: 'confirmed',
  people,
  ...extra,
});

describe('premiumTrialJudges', () => {
  it('prints a judge on two classes once, with city, state and both classes (Heartland Trial 2)', () => {
    expect(premiumTrialJudges([row(donovan, 'c-cont-b'), row(donovan, 'c-buried')], trial)).toEqual(
      [
        {
          name: 'Pat Donovan',
          residence: 'Demoville, KS',
          classes: ['Buried Master', 'Container Novice B'],
        },
      ]
    );
  });

  it('matches a class-level row with no trial_id (set_class_judge) through its class', () => {
    expect(premiumTrialJudges([row(donovan, 'c-int', { trial_id: null })], trial)).toEqual([
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: ['Interior Advanced'] },
    ]);
  });

  it('leaves out a judge whose classes are all on another trial', () => {
    expect(premiumTrialJudges([row(donovan, 'c-other-trial', { trial_id: 't-1' })], trial)).toEqual(
      []
    );
  });

  it('keeps judges in row order, each with only their own classes', () => {
    expect(
      premiumTrialJudges(
        [row(kerr, 'c-int'), row(donovan, 'c-cont-a'), row(kerr, 'c-cont-a')],
        trial
      )
    ).toEqual([
      { name: 'Sam Kerr', residence: null, classes: ['Container Novice A', 'Interior Advanced'] },
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: ['Container Novice A'] },
    ]);
  });

  it('lists no classes for a whole-trial judge, and a whole-show judge appears on every trial', () => {
    expect(premiumTrialJudges([row(donovan, 'c-int'), row(donovan, null)], trial)).toEqual([
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: [] },
    ]);
    expect(premiumTrialJudges([row(kerr, null, { trial_id: null })], trial)).toEqual([
      { name: 'Sam Kerr', residence: null, classes: [] },
    ]);
    expect(premiumTrialJudges([row(kerr, null, { trial_id: 't-1' })], trial)).toEqual([]);
  });

  it('prints nothing for declined or cancelled assignments, or for a deleted class', () => {
    const withDeleted = {
      id: 't-2',
      classes: [
        ...classes,
        {
          id: 'c-gone',
          element: 'Buried',
          level: 'Novice',
          section: 'A',
          deleted_at: '2026-11-01',
        },
      ],
    };
    expect(
      premiumTrialJudges(
        [
          row(donovan, 'c-int', { status: 'declined' }),
          row(kerr, 'c-int', { status: 'cancelled' }),
          row(donovan, 'c-gone'),
        ],
        withDeleted
      )
    ).toEqual([]);
  });

  it('skips rows with no person or no name, and a trial with no assignments', () => {
    expect(
      premiumTrialJudges(
        [row(null, 'c-int'), row({ id: 'p-3', first_name: ' ', last_name: null }, 'c-int')],
        trial
      )
    ).toEqual([]);
    expect(premiumTrialJudges(undefined, trial)).toEqual([]);
    expect(premiumTrialJudges([], { id: 't-2', classes: undefined })).toEqual([]);
  });
});

describe('formatResidence', () => {
  it('prints "City, ST", the city alone, or nothing without a city', () => {
    expect(formatResidence(' Demoville ', ' KS ')).toBe('Demoville, KS');
    expect(formatResidence('Demoville', null)).toBe('Demoville');
    expect(formatResidence(null, 'IL')).toBeNull();
    expect(formatResidence('  ', 'IL')).toBeNull();
  });
});

describe('generate-premium wiring', () => {
  it('reads judges for the whole show, ordered, and folds them per trial by class', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(source).toContain(".from('judge_assignments')");
    expect(source).toContain('.select(PREMIUM_JUDGE_ASSIGNMENTS_SELECT)');
    expect(source).toContain(".order('created_at', { ascending: true })");
    expect(source).toContain('judges: premiumTrialJudges(judgeAssignments, trial)');
    // The nested trials(judge_assignments(...)) embed dropped rows with no trial_id.
    expect(source).not.toMatch(/^\s*judge_assignments\(/m);
    expect(source).not.toContain('elements: [] as string[]');
  });
});

describe('a roster judge with class assignments (MYK9-2244)', () => {
  const t1 = {
    id: 't-1',
    classes: [{ id: 'c-t1', element: 'Buried', level: 'Novice', section: null }],
  };
  const t2 = {
    id: 't-2',
    classes: [{ id: 'c-t2', element: 'Buried', level: 'Novice', section: null }],
  };
  const rosterRow = row(donovan, null, { trial_id: null });
  const classRow = row(donovan, 'c-t1', { trial_id: null });

  it('lists the judge only on the trial of their class, with that class', () => {
    expect(premiumTrialJudges([rosterRow, classRow], t1)).toEqual([
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: ['Buried Novice'] },
    ]);
    expect(premiumTrialJudges([rosterRow, classRow], t2)).toEqual([]);
  });

  it('a roster-only judge still lists on every trial with no class line', () => {
    for (const trialRow of [t1, t2]) {
      expect(premiumTrialJudges([rosterRow], trialRow)).toEqual([
        { name: 'Pat Donovan', residence: 'Demoville, KS', classes: [] },
      ]);
    }
  });

  it('a trial-level row with no class still covers that whole trial', () => {
    const wholeTrial = row(donovan, null, { trial_id: 't-1' });
    expect(premiumTrialJudges([wholeTrial, classRow], t1)[0]?.classes).toEqual([]);
  });
});
