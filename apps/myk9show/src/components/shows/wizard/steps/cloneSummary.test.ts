import { describe, expect, it } from 'vitest';
import type { Show, ShowTrial } from '@/types/show-types';
import { buildCloneSnapshot } from './cloneFromShow';
import {
  CLONE_SNAPSHOT_FIELD_KINDS,
  CLONE_SHOW_FIELD_RULES,
  CLONE_TRIAL_FIELD_RULES,
  summarizeClone,
  type CloneSummaryLiveDraft,
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

type Snapshot = ReturnType<typeof snapshotOf>;

/** The draft exactly as the clone left it. */
const liveOf = (snapshot: Snapshot): CloneSummaryLiveDraft => ({
  show: {
    name: snapshot.show.name ?? '',
    judgeIds: snapshot.show.judgeIds ?? [],
    startDate: '',
    endDate: '',
    entryOpenDate: '',
    entryCloseDate: '',
  },
  trials: snapshot.trials.map(t => ({ trialDate: t.trialDate, eventNumber: t.eventNumber })),
});

const summarize = (snapshot: Snapshot, live: CloneSummaryLiveDraft = liveOf(snapshot)) =>
  summarizeClone(snapshot, live);

const texts = (items: Array<{ text: string }>) => items.map(item => item.text);

describe('summarizeClone judges', () => {
  it('asks the secretary to confirm carried-forward judges, linked to the picker', () => {
    const summary = summarize(
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
    const summary = summarize(snapshotOf());
    expect(
      summary.needsConfirm.find(item => item.targetId === 'judges-picker-trigger')
    ).toBeUndefined();
  });
});

describe('summarizeClone show name', () => {
  it('flags a name containing a four-digit year', () => {
    const summary = summarize(snapshotOf({ name: 'Spring Trial 2025' }));
    const name = summary.needsConfirm.find(item => item.targetId === 'show-name');
    expect(name?.text).toBe(
      "Show name copied as 'Spring Trial 2025'. Check the year or date in it."
    );
    expect(name?.targetId).toBe('show-name');
  });

  it('flags a name that still matches the source show exactly', () => {
    const summary = summarize(snapshotOf({ name: 'Heartland Spring Trial' }));
    expect(summary.needsConfirm.map(item => item.targetId)).toContain('show-name');
  });

  it('does not flag a name the secretary has already changed and that has no year', () => {
    const snapshot = snapshotOf({ name: 'Heartland Spring Trial' });
    const edited = { ...snapshot, show: { ...snapshot.show, name: 'Heartland Fall Trial' } };
    expect(summarize(edited).needsConfirm.map(item => item.targetId)).not.toContain('show-name');
  });
});

describe('summarizeClone trials, carried and cleared', () => {
  it('counts trials and classes, and lists cleared trial dates and event numbers', () => {
    const summary = summarize(snapshotOf({}, [trial('t1', 2), trial('t2', 3)]));
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
        'Officials',
        'Premium style',
      ])
    );
  });

  it('does not mention trial dates or counts when the source had no trials', () => {
    const summary = summarize(snapshotOf());
    expect(texts(summary.cleared)).not.toContain('Trial dates');
    expect(texts(summary.cleared)).not.toContain('Event numbers');
    expect(texts(summary.carried).join(' ')).not.toMatch(/trial/i);
  });

  it('uses singular wording for one trial and one class', () => {
    const carried = texts(summarize(snapshotOf({}, [trial('t1', 1)])).carried);
    expect(carried).toContain('1 trial');
    expect(carried).toContain('1 class');
  });
});

describe('summarizeClone name rule', () => {
  it("flags a year, but not four digits that are not a year ('Trial 1000')", () => {
    expect(summarize(snapshotOf({ name: 'Spring 2025' })).needsConfirm[0]?.text).toBe(
      "Show name copied as 'Spring 2025'. Check the year or date in it."
    );
    // buildCloneSnapshot always copies the source name, so make the draft name differ from it.
    const renamed = { ...snapshotOf({ name: 'Trial 1000' }), sourceShowName: 'Last year' };
    expect(summarize(renamed).needsConfirm).toEqual([]);
  });

  it('hides the name item once the secretary edits the name', () => {
    const snapshot = snapshotOf({ name: 'Spring 2025' });
    const live = liveOf(snapshot);
    const edited = { ...live, show: { ...live.show, name: 'Spring 2026' } };
    expect(summarize(snapshot, edited).needsConfirm).toEqual([]);
  });
});

describe('summarizeClone reads the snapshot, live state only removes items', () => {
  it('does not call hand-added judges, fees or trials carried', () => {
    const snapshot = snapshotOf({ preEntryFee: '0', dayOfShowFee: '0' });
    const live = liveOf(snapshot);
    const typed: CloneSummaryLiveDraft = {
      show: { ...live.show, judgeIds: ['j9'] },
      trials: [{ trialDate: '', eventNumber: '' }],
    };
    const summary = summarize(snapshot, typed);
    expect(summary.needsConfirm.map(i => i.targetId)).not.toContain('judges-picker-trigger');
    expect(texts(summary.carried)).not.toContain('Fees');
    expect(texts(summary.carried).join(' ')).not.toMatch(/trial/i);
  });

  it('hides the judges item once the draft has no judges', () => {
    const snapshot = snapshotOf({
      assignedJudges: [{ judgeId: 'j1', judgeName: 'Ann Judge', assignedClasses: [] }],
    });
    const live = liveOf(snapshot);
    const none = { ...live, show: { ...live.show, judgeIds: [] } };
    expect(summarize(snapshot, none).needsConfirm.map(i => i.targetId)).not.toContain(
      'judges-picker-trigger'
    );
  });

  it('hides cleared date and event-number items once every live field is filled', () => {
    const snapshot = snapshotOf({}, [trial('t1', 1)]);
    const live: CloneSummaryLiveDraft = {
      show: {
        ...liveOf(snapshot).show,
        startDate: '2027-03-01',
        endDate: '2027-03-02',
        entryOpenDate: '2027-01-01',
        entryCloseDate: '2027-02-01',
      },
      trials: [{ trialDate: '2027-03-01', eventNumber: '2027-1' }],
    };
    const cleared = texts(summarize(snapshot, live).cleared);
    expect(cleared).not.toContain('Show dates');
    expect(cleared).not.toContain('Entry period dates');
    expect(cleared).not.toContain('Trial dates');
    expect(cleared).not.toContain('Event numbers');
    expect(cleared).toContain('Officials');
  });

  it('labels online entries separately from payment options', () => {
    const carried = texts(summarize(snapshotOf({ onlineEntriesEnabled: false })).carried);
    expect(carried).toContain('Online entries setting');
  });
});

describe('clone summary classification guard', () => {
  it('catches keys the builder emits outside the typed tables (class-level settings are counted, not itemized)', () => {
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
