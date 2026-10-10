import { describe, expect, it } from 'vitest';
import type { Show, ShowTrial } from '@/types/show-types';
import { buildCloneSnapshot } from './cloneFromShow';
import {
  CLONE_SNAPSHOT_FIELD_KINDS,
  CLONE_SHOW_FIELD_RULES,
  CLONE_TRIAL_FIELD_RULES,
  summarizeClone,
} from './cloneSummary';

const show = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'show-1',
    name: 'Heartland Spring Trial',
    organization: 'UKC',
    location: 'Tulsa Fairgrounds',
    clubId: 'club-1',
    preEntryFee: '28',
    dayOfShowFee: '35',
    acceptCheckPayments: true,
    assignedJudges: [],
    ...overrides,
  }) as unknown as Show;

const trial = (id: string, classCount: number): ShowTrial =>
  ({
    id,
    name: `Trial ${id}`,
    trialType: 'Scent Work',
    classes: Array.from({ length: classCount }, (_, i) => ({
      id: `${id}-c${i}`,
      name: `Class ${i}`,
      entryFee: 30,
    })),
  }) as unknown as ShowTrial;

const people = [
  { id: 'j1', firstName: 'Ann', lastName: 'Judge' },
  { id: 'j2', firstName: 'Bo', lastName: 'Judge' },
];

function snapshotOf(overrides: Record<string, unknown> = {}, sourceTrials: ShowTrial[] = []) {
  return buildCloneSnapshot({ show: show(overrides), sourceTrials, people, templates: [] });
}

const texts = (items: Array<{ text: string }>) => items.map(item => item.text);

describe('summarizeClone judges', () => {
  it('asks the secretary to confirm carried-forward judges, linked to the picker', () => {
    const summary = summarizeClone(
      snapshotOf({
        assignedJudges: [
          { judgeId: 'j1', judgeName: 'Ann Judge', assignedClasses: [] },
          { judgeId: 'j2', judgeName: 'Bo Judge', assignedClasses: [] },
        ],
      })
    );
    const judges = summary.needsConfirm.find(item => item.targetId === 'judges-picker-trigger');
    expect(judges?.text).toBe('Judges: 2 carried forward. Confirm they are judging this year.');
    expect(judges?.targetId).toBe('judges-picker-trigger');
  });

  it('says nothing about judges when none were carried', () => {
    const summary = summarizeClone(snapshotOf());
    expect(
      summary.needsConfirm.find(item => item.targetId === 'judges-picker-trigger')
    ).toBeUndefined();
  });
});

describe('summarizeClone show name', () => {
  it('flags a name containing a four-digit year', () => {
    const summary = summarizeClone(snapshotOf({ name: 'Spring Trial 2025' }));
    const name = summary.needsConfirm.find(item => item.targetId === 'show-name');
    expect(name?.text).toBe(
      "Show name copied as 'Spring Trial 2025'. Check it for last year's date."
    );
    expect(name?.targetId).toBe('show-name');
  });

  it('flags a name that still matches the source show exactly', () => {
    const summary = summarizeClone(snapshotOf({ name: 'Heartland Spring Trial' }));
    expect(summary.needsConfirm.map(item => item.targetId)).toContain('show-name');
  });

  it('does not flag a name the secretary has already changed and that has no year', () => {
    const snapshot = snapshotOf({ name: 'Heartland Spring Trial' });
    const edited = { ...snapshot, show: { ...snapshot.show, name: 'Heartland Fall Trial' } };
    expect(summarizeClone(edited).needsConfirm.map(item => item.targetId)).not.toContain(
      'show-name'
    );
  });
});

describe('summarizeClone trials, carried and cleared', () => {
  it('counts trials and classes, and lists cleared trial dates and event numbers', () => {
    const summary = summarizeClone(snapshotOf({}, [trial('t1', 2), trial('t2', 3)]));
    const carried = texts(summary.carried);
    expect(carried).toContain('2 trials');
    expect(carried).toContain('5 classes');
    expect(carried).toContain('Fees');
    expect(carried).toContain('Payment options');
    expect(carried).toContain('Venue');
    const cleared = texts(summary.cleared);
    expect(cleared).toEqual(
      expect.arrayContaining([
        'Show dates',
        'Entry period dates',
        'Trial dates',
        'Event numbers',
        'Officials (you are set as secretary)',
        'Premium style',
      ])
    );
  });

  it('does not mention trial dates or counts when the source had no trials', () => {
    const summary = summarizeClone(snapshotOf());
    expect(texts(summary.cleared)).not.toContain('Trial dates');
    expect(texts(summary.cleared)).not.toContain('Event numbers');
    expect(texts(summary.carried).join(' ')).not.toMatch(/trial/i);
  });

  it('uses singular wording for one trial and one class', () => {
    const carried = texts(summarizeClone(snapshotOf({}, [trial('t1', 1)])).carried);
    expect(carried).toContain('1 trial');
    expect(carried).toContain('1 class');
  });
});

describe('clone summary classification guard', () => {
  it('classifies every field of a real snapshot (add a snapshot field, classify it here)', () => {
    const snapshot = snapshotOf(
      {
        juniorHandlerFee: '15',
        onlineEntriesEnabled: true,
        assignedJudges: [{ judgeId: 'j1', judgeName: 'Ann Judge', assignedClasses: [] }],
      },
      [trial('t1', 1)]
    );
    const unclassified = [
      ...Object.keys(snapshot).filter(key => !(key in CLONE_SNAPSHOT_FIELD_KINDS)),
      ...Object.keys(snapshot.show).filter(key => !(key in CLONE_SHOW_FIELD_RULES)),
      ...Object.keys(snapshot.trials[0] ?? {}).filter(key => !(key in CLONE_TRIAL_FIELD_RULES)),
    ];
    expect(unclassified).toEqual([]);
    expect(snapshot.trials).toHaveLength(1);
  });
});
