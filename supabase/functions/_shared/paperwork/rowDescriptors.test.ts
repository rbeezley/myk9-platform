// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildPaperworkClassFacts,
  paperworkEntryInScope,
  type PaperworkClassRow,
  type PaperworkEntryRow,
} from './rowDescriptors.ts';
import { compactFingerprint } from './paperworkFingerprint.ts';

// The check-in sheet and scoresheet no longer use these rows (MYK9-2103, printedSheet.test.ts);
// they remain for the results descriptors.
const classes: PaperworkClassRow[] = [
  {
    id: 'class-1',
    trial_id: 'trial-1',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    status: 'in_progress',
    judgeName: 'Judge One',
    time_limit_seconds: '180.5',
    num_areas: 1,
  },
  { id: 'class-2', trial_id: 'trial-2', element: 'Interior', level: 'Excellent', section: null },
];
const entries: PaperworkEntryRow[] = [
  { id: 'e1', class_id: 'class-1' },
  { id: 'e3', class_id: 'class-2' },
];

describe('compactFingerprint', () => {
  it('is key-order independent and prefixed', () => {
    expect(compactFingerprint({ a: 1, b: 2 })).toBe(compactFingerprint({ b: 2, a: 1 }));
    expect(compactFingerprint('x')).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
  });
});

describe('paperworkEntryInScope', () => {
  it('scopes by class, by trial, and the whole show', () => {
    const classScope = {
      kind: 'class',
      showId: 's',
      trialId: 'trial-1',
      classId: 'class-1',
    } as const;
    const trialScope = { kind: 'trial', showId: 's', trialId: 'trial-2' } as const;
    expect(entries.filter(entry => paperworkEntryInScope(entry, classScope, classes))).toEqual([
      entries[0],
    ]);
    expect(entries.filter(entry => paperworkEntryInScope(entry, trialScope, classes))).toEqual([
      entries[1],
    ]);
    expect(
      entries.filter(entry => paperworkEntryInScope(entry, { kind: 'show', showId: 's' }, classes))
    ).toHaveLength(2);
  });
});

describe('buildPaperworkClassFacts', () => {
  it('hashes the class status and an absent judge as null, for the results sheets', () => {
    const [facts] = buildPaperworkClassFacts(
      [entries[0]!],
      new Map(classes.map(item => [item.id, item]))
    );
    expect(facts?.facts).toMatchObject({ status: 'in_progress', judgeName: 'Judge One' });
    const [noJudge] = buildPaperworkClassFacts(
      [entries[1]!],
      new Map(classes.map(item => [item.id, item]))
    );
    expect(noJudge?.facts).toMatchObject({ judgeName: null });
  });
});
