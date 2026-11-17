import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  formatResidence,
  premiumTrialJudges,
  type PremiumTrialClassRow,
  type PremiumTrialJudgeRow,
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

const row = (people: PremiumTrialJudgeRow['people'], class_id: string | null) => ({
  class_id,
  people,
});

describe('premiumTrialJudges', () => {
  it('prints a judge on two classes once, with city, state and both classes (Heartland Trial 2)', () => {
    expect(
      premiumTrialJudges([row(donovan, 'c-cont-b'), row(donovan, 'c-buried')], classes)
    ).toEqual([
      {
        name: 'Pat Donovan',
        residence: 'Demoville, KS',
        classes: ['Buried Master', 'Container Novice B'],
      },
    ]);
  });

  it('keeps judges in the order first assigned, each with only their own classes', () => {
    expect(
      premiumTrialJudges(
        [row(kerr, 'c-int'), row(donovan, 'c-cont-a'), row(kerr, 'c-cont-a')],
        classes
      )
    ).toEqual([
      { name: 'Sam Kerr', residence: null, classes: ['Container Novice A', 'Interior Advanced'] },
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: ['Container Novice A'] },
    ]);
  });

  it('lists no classes for a judge assigned to the whole trial, even with class rows too', () => {
    expect(premiumTrialJudges([row(donovan, 'c-int'), row(donovan, null)], classes)).toEqual([
      { name: 'Pat Donovan', residence: 'Demoville, KS', classes: [] },
    ]);
  });

  it('skips a class that is not on this trial, and rows with no person or no name', () => {
    expect(
      premiumTrialJudges(
        [
          row(donovan, 'c-other-trial'),
          row(null, 'c-int'),
          row({ id: 'p-3', first_name: ' ', last_name: null }, 'c-int'),
        ],
        classes
      )
    ).toEqual([{ name: 'Pat Donovan', residence: 'Demoville, KS', classes: [] }]);
  });

  it('returns nothing for a trial with no assignments', () => {
    expect(premiumTrialJudges(undefined, classes)).toEqual([]);
    expect(premiumTrialJudges([], undefined)).toEqual([]);
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
  it('selects the judges with city, state and class, and folds them per trial', () => {
    const source = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(source).toContain('judge_assignments(${PREMIUM_TRIAL_JUDGES_SELECT})');
    expect(source).toContain('judges: premiumTrialJudges(trial.judge_assignments, trial.classes)');
    expect(source).not.toContain('elements: [] as string[]');
  });
});
