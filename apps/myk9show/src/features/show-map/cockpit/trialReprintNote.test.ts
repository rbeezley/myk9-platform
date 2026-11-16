import { describe, expect, it } from 'vitest';

import { nextTrialPaperworkNote } from './trialReprintNote';
import type {
  PaperworkState,
  SecretaryCockpitClass,
  SecretaryCockpitTrial,
} from './secretaryCockpitTypes';

const trials: SecretaryCockpitTrial[] = [
  { id: 't1', date: '2026-12-07', number: '1', storedNumber: '1', order: 1 },
  { id: 't2', date: '2026-12-07', number: '2', storedNumber: '2', order: 2 },
  { id: 't3', date: '2026-12-08', number: '1', storedNumber: '1', order: 3 },
];

function cls(
  id: string,
  trialId: string,
  lifecycle: SecretaryCockpitClass['lifecycle'],
  sheet?: PaperworkState,
  counts: Partial<Pick<SecretaryCockpitClass, 'entryCount' | 'runListCount'>> = {}
): SecretaryCockpitClass {
  return {
    id,
    trialId,
    name: id,
    classOrder: 0,
    lifecycle,
    attention: [],
    actions: [],
    entryRows: [],
    paperwork: sheet ? [{ reportId: 'check-in-sheet', label: 'Check-in sheet', state: sheet }] : [],
    ...counts,
  };
}

const note = (
  trialId: string,
  classes: SecretaryCockpitClass[],
  all: SecretaryCockpitTrial[] = trials
) =>
  nextTrialPaperworkNote({
    showId: 'show-1',
    trial: all.find(item => item.id === trialId)!,
    trials: all,
    classes,
  });

describe('nextTrialPaperworkNote (decision 6)', () => {
  it('says the trial finished and offers the next trial paperwork, with the packet link', () => {
    const result = note('t2', [
      cls('a', 't1', 'complete'),
      cls('b', 't2', 'not-started', 'unconfirmed'),
    ]);
    expect(result).toEqual({
      text: "Trial 1 is finished. Trial 2's paperwork is ready to print.",
      linkLabel: "Print Trial 2's paperwork",
      href: '/shows/show-1?day=2026-12-07&packet=t2',
    });
  });

  it('covers a trial printed and since changed, and goes quiet once it is current', () => {
    const done = cls('a', 't1', 'complete');
    expect(note('t2', [done, cls('b', 't2', 'not-started', 'stale')])).not.toBeNull();
    expect(note('t2', [done, cls('b', 't2', 'not-started', 'current')])).toBeNull();
  });

  it('names the next day armband labels, with their own door, only while some need printing', () => {
    const labels = (notPrinted: string[]): SecretaryCockpitClass => ({
      ...cls('d', 't3', 'not-started', 'unconfirmed'),
      paperwork: [
        { reportId: 'check-in-sheet', label: 'Check-in sheet', state: 'unconfirmed' },
        {
          reportId: 'armband-labels',
          label: 'Armband labels',
          state: notPrinted.length ? 'unconfirmed' : 'current',
          labelsToPrint: { notPrinted, changed: [] },
        },
      ],
    });
    const result = note('t3', [cls('b', 't2', 'complete'), labels(['dog-1:2026-12-08'])]);
    expect(result?.text).toBe(
      "Trial 2 is finished. Trial 1's paperwork is ready to print. Tuesday's armband labels are ready too."
    );
    expect(result?.href).toBe('/shows/show-1?day=2026-12-08&packet=t3');
    expect(result?.labels).toEqual({
      linkLabel: "Print Tuesday's labels",
      href: '/shows/show-1?day=2026-12-08&focus=d',
    });

    const printed = note('t3', [cls('b', 't2', 'complete'), labels([])]);
    expect(printed?.text).toBe("Trial 2 is finished. Trial 1's paperwork is ready to print.");
    expect(printed?.labels).toBeUndefined();
  });

  it('goes away once this trial has started, printed or not', () => {
    const done = cls('a', 't1', 'complete');
    expect(
      note('t2', [
        done,
        cls('b', 't2', 'in-progress', 'unconfirmed'),
        cls('c', 't2', 'not-started'),
      ])
    ).toBeNull();
    expect(note('t2', [done, cls('b', 't2', 'complete', 'unconfirmed')])).toBeNull();
  });

  it('does not let a cancelled class with entries keep the note open', () => {
    const done = cls('a', 't1', 'complete');
    expect(
      note('t2', [
        done,
        cls('b', 't2', 'cancelled', 'unconfirmed'),
        cls('c', 't2', 'not-started', 'current'),
      ])
    ).toBeNull();
  });

  it('reads the stored trial number, not a made-up one, and says nothing on a tie', () => {
    const blank: SecretaryCockpitTrial[] = [
      { id: 't1', date: '2026-12-07', number: '1', storedNumber: null, order: 1 },
      { id: 't2', date: '2026-12-07', number: '2', storedNumber: null, order: 2 },
    ];
    expect(
      note('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'unconfirmed')], blank)
    ).toBeNull();
  });

  it('stays quiet while the trial before is running, or when a sheet cannot be checked', () => {
    expect(
      note('t2', [
        cls('a', 't1', 'complete'),
        cls('a2', 't1', 'in-progress'),
        cls('b', 't2', 'not-started', 'stale'),
      ])
    ).toBeNull();
    expect(
      note('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'unknown')])
    ).toBeNull();
    expect(note('t2', [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started')])).toBeNull();
  });

  it('does not let a cancelled or confirmed-empty class hold the trial open', () => {
    const rest = [cls('a', 't1', 'complete'), cls('b', 't2', 'not-started', 'stale')];
    expect(note('t2', [...rest, cls('x', 't1', 'cancelled')])).not.toBeNull();
    expect(
      note('t2', [
        ...rest,
        cls('y', 't1', 'not-started', undefined, { entryCount: 0, runListCount: 0 }),
      ])
    ).not.toBeNull();
    // An unread count is not empty.
    expect(
      note('t2', [...rest, cls('z', 't1', 'not-started', undefined, { entryCount: null })])
    ).toBeNull();
  });

  it('needs a class that ran: a trial with no classes to run has not "finished"', () => {
    expect(
      note('t2', [cls('x', 't1', 'cancelled'), cls('b', 't2', 'not-started', 'stale')])
    ).toBeNull();
  });

  it('has no note for the first trial, and says nothing when the order before it is a tie', () => {
    expect(note('t1', [cls('a', 't1', 'not-started', 'stale')])).toBeNull();
    const tied: SecretaryCockpitTrial[] = [
      { id: 'u1', date: '2026-12-07', number: 'A', name: 'Morning', order: 1 },
      { id: 'u2', date: '2026-12-07', number: 'A', name: 'Afternoon', order: 1 },
      { id: 'u3', date: '2026-12-08', number: '1', order: 2 },
    ];
    const result = note(
      'u3',
      [
        cls('a', 'u1', 'complete'),
        cls('b', 'u2', 'complete'),
        cls('c', 'u3', 'not-started', 'stale'),
      ],
      tied
    );
    expect(result).toBeNull();
  });
});
