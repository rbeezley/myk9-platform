import { describe, expect, it } from 'vitest';
import type { ClassEntry } from '@myk9/ringside';
import {
  EMPTY_UNSENT_WORK,
  type UnsentScore,
  type UnsentWork,
} from '@/services/replication/unsentWork';
import type { UnsentWorkState } from '@/hooks/useUnsentWork';
import type { DatedRingClass } from './orderRingClassesByDay';
import { ringDayDone, todaysRingClassesDone } from './ringDayDone';

function card(
  id: string,
  {
    completed = true,
    dayBucket = 'today',
    cancelled = false,
  }: { completed?: boolean; dayBucket?: DatedRingClass['dayBucket']; cancelled?: boolean } = {}
): DatedRingClass {
  return {
    entry: {
      id,
      class_name: id,
      class_status: completed ? 'completed' : 'in_progress',
      entry_count: 10,
      completed_count: completed ? 10 : 4,
      dogs: [],
      ...(cancelled ? { is_cancelled: true } : {}),
    } as unknown as ClassEntry,
    scanPriority: 1,
    trialTimeZone: 'America/New_York',
    dayBucket,
    isToday: dayBucket === 'today',
  };
}

const eightDone = Array.from({ length: 8 }, (_, i) => card(`c${i}`));

const score = (
  entryId: string,
  showId: string | undefined = 'show-1',
  state: UnsentScore['state'] = 'waiting'
) => ({ entryId, showId, state }) as UnsentScore;

const state = (work: Partial<UnsentWork>, status: UnsentWorkState['status'] = 'known') => ({
  work: { ...EMPTY_UNSENT_WORK, ...work },
  status,
});

/** Unsent work holding these score units, counted the way the source counts them. */
const scores = (units: UnsentScore[], extra: Partial<UnsentWork> = {}) => {
  const unsent = units.filter(u => u.state !== 'superseded').length;
  return {
    scores: units,
    unsentScoreCount: unsent,
    total: unsent + (extra.otherChangeCount ?? 0),
    ...extra,
  };
};

describe('ringDayDone (MYK9-2013)', () => {
  it('says every score is sent when today is done and nothing is waiting', () => {
    expect(ringDayDone('show-1', eightDone, state({}))).toEqual({
      kind: 'sent',
      text: 'All 8 classes done. Every score is sent.',
    });
  });

  it('names the unsent scores and keeps the phone on', () => {
    expect(ringDayDone('show-1', eightDone, state(scores([score('e1'), score('e2')])))).toEqual({
      kind: 'unsent',
      text: '2 scores not sent. Keep this phone on and connected.',
      unsentScoreCount: 2,
    });
  });

  it('never says sent while a refused score is counted', () => {
    const done = ringDayDone(
      'show-1',
      eightDone,
      state(scores([score('e1', 'show-1', 'refused')], { refusedCount: 1 }))
    );
    expect(done?.kind).toBe('unsent');
    expect(done?.text).toBe('1 score not sent. Keep this phone on and connected.');
  });

  it('never says sent while another change is waiting', () => {
    const done = ringDayDone('show-1', eightDone, state({ otherChangeCount: 1, total: 1 }));
    expect(done?.text).toBe('1 change not sent. Keep this phone on and connected.');
  });

  it('never says sent before the first read of this device, or after a failed one', () => {
    const loading = ringDayDone('show-1', eightDone, state({}, 'loading'));
    const failed = ringDayDone('show-1', eightDone, state({}, 'failed'));
    expect(loading).toEqual({
      kind: 'checking',
      text: 'All 8 classes done. Checking this phone for scores not sent.',
    });
    expect(failed).toEqual({
      kind: 'unchecked',
      text: 'All 8 classes done. This phone could not be checked for scores not sent.',
    });
    expect(loading?.text).not.toMatch(/is sent/);
    expect(failed?.text).not.toMatch(/is sent/);
  });

  it('says nothing while any of today’s classes is still open', () => {
    expect(
      ringDayDone('show-1', [...eightDone, card('open', { completed: false })], state({}))
    ).toBeNull();
  });

  it('counts only today: past and upcoming classes neither count nor hold the card back', () => {
    const cards = [
      card('t1'),
      card('t2'),
      card('past', { dayBucket: 'past', completed: false }),
      card('next', { dayBucket: 'upcoming', completed: false }),
    ];
    expect(todaysRingClassesDone(cards)).toBe(2);
    expect(todaysRingClassesDone([card('next', { dayBucket: 'upcoming' })])).toBeNull();
  });

  it('leaves a cancelled class out of the count', () => {
    expect(
      todaysRingClassesDone([card('t1'), card('x', { completed: false, cancelled: true })])
    ).toBe(1);
    expect(ringDayDone('show-1', [card('t1')], state({}))?.text).toBe(
      '1 class done. Every score is sent.'
    );
  });

  // Owner review: the count and the list it links to must agree (both are this show's).
  it('counts only this show’s scores, and a score with no show on every show', () => {
    const done = ringDayDone(
      'show-1',
      eightDone,
      state(scores([score('e1'), score('e2', undefined), score('e3', 'show-2')]))
    );
    expect(done).toEqual({
      kind: 'unsent',
      text: '2 scores not sent. Keep this phone on and connected.',
      unsentScoreCount: 2,
    });
  });

  it('names another show’s scores in words, with no link and no "Every score is sent"', () => {
    const done = ringDayDone(
      'show-1',
      eightDone,
      state(scores([score('e1', 'show-2'), score('e2', 'show-2')]))
    );
    expect(done).toEqual({
      kind: 'elsewhere',
      text: 'All 8 classes done. Every score for this show is sent. 2 from another show are still on this phone.',
    });
  });

  it('never falls through to "sent" while the source counts a score', () => {
    const done = ringDayDone('show-1', eightDone, state({ unsentScoreCount: 1, total: 1 }));
    expect(done?.kind).toBe('elsewhere');
    expect(done?.text).not.toMatch(/Every score is sent/);
  });

  it('does not count a superseded score anywhere', () => {
    const done = ringDayDone(
      'show-1',
      eightDone,
      state(scores([score('e1', 'show-1', 'superseded'), score('e2', 'show-2', 'superseded')]))
    );
    expect(done?.kind).toBe('sent');
  });

  it('never says this show is sent before a known read, even with another show unsent', () => {
    const done = ringDayDone('show-1', eightDone, state(scores([score('e1', 'show-2')]), 'failed'));
    expect(done?.kind).toBe('unchecked');
  });

  it('says nothing with no class in Your ring today', () => {
    expect(ringDayDone('show-1', [], state({}))).toBeNull();
  });
});
