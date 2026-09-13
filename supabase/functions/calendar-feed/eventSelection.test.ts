import { describe, expect, it } from 'vitest';
import { buildVEvent, type CalendarClassEvent } from './icsBuilder';
import {
  FALLBACK_TIME_ZONE,
  resolveTrialZone,
  selectFeedEvents,
  type ClassEventForFeed,
  type TrialForFeed,
} from './eventSelection';

const DTSTAMP = new Date('2026-09-13T12:00:00Z');
const ORIGIN = 'myk9show.com';

function trial(overrides: Partial<TrialForFeed> = {}): TrialForFeed {
  return {
    id: 'trial-1',
    name: 'Load 1 Trial 1',
    date: '2026-10-24',
    timezone: 'America/Chicago',
    plannedStartTime: '8:00 AM',
    actualStartTime: null,
    plannedEndTime: null,
    ...overrides,
  };
}

function classEvent(
  overrides: Partial<CalendarClassEvent> = {},
  trialId = 'trial-1'
): ClassEventForFeed {
  return {
    trialId,
    event: {
      kind: 'class',
      classId: 'class-1',
      className: 'Load 1 Class 1',
      trialDate: '2026-10-24',
      startTime: null,
      actualStartTime: null,
      actualEndTime: null,
      estimatedDuration: null,
      timeZone: 'America/Chicago',
      venue: null,
      armband: 314,
      dogName: 'Cooper',
      trialName: 'Load 1 Trial 1',
      ...overrides,
    },
  };
}

function select(input: Partial<Parameters<typeof selectFeedEvents>[0]> = {}) {
  return selectFeedEvents({
    trials: [trial()],
    classEvents: [classEvent()],
    armbandsByTrialId: new Map([['trial-1', new Set([314])]]),
    showName: 'MYK9-109 Load Show 1',
    venue: 'Purina Farms',
    ...input,
  });
}

describe('selectFeedEvents', () => {
  it('falls back to ONE trial-day block when no class that day has a time', () => {
    // The reported failure: four untimed classes yielded an empty calendar.
    const events = select({
      classEvents: [
        classEvent({ classId: 'c1', className: 'Load 1 Class 1' }),
        classEvent({ classId: 'c2', className: 'Load 1 Class 2' }),
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'trial',
      trialId: 'trial-1',
      plannedStartTime: '8:00 AM',
      classNames: ['Load 1 Class 1', 'Load 1 Class 2'],
      armbands: [314],
    });
  });

  it('never returns an empty feed for a day the exhibitor is entered and the trial has a start', () => {
    // This is the property the bug violated. State it directly.
    const events = select();
    expect(events.length).toBeGreaterThan(0);
    expect(buildVEvent(events[0], DTSTAMP, ORIGIN)).not.toBe('');
  });

  it('prefers real class times and does NOT also add the day block', () => {
    const events = select({
      classEvents: [classEvent({ classId: 'c1', startTime: '09:30' })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'class', classId: 'c1' });
  });

  it('keeps the timed classes and drops untimed siblings once the day is published', () => {
    // A day with published times is a scheduled day; an untimed class in it is
    // genuinely unscheduled, not a reason to fall back to a whole-day block.
    const events = select({
      classEvents: [
        classEvent({ classId: 'timed', startTime: '09:30' }),
        classEvent({ classId: 'untimed' }),
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'class', classId: 'timed' });
  });

  it('treats a class that has actually started as timed, even with no scheduled time', () => {
    const events = select({
      classEvents: [classEvent({ classId: 'live', actualStartTime: '2026-10-24T14:00:00Z' })],
    });
    expect(events[0]).toMatchObject({ kind: 'class', classId: 'live' });
  });

  it('carries the trial actual start through to the block', () => {
    const events = select({
      trials: [trial({ plannedStartTime: null, actualStartTime: '8:42 AM' })],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'trial', actualStartTime: '8:42 AM' });
  });

  it('emits nothing for a day with neither class times nor a trial start', () => {
    // Honest silence. The subscribe dialog is what warns the exhibitor.
    expect(
      select({ trials: [trial({ plannedStartTime: null, actualStartTime: null })] })
    ).toEqual([]);
  });

  it('skips a trial the exhibitor has no entries in', () => {
    const events = select({
      trials: [trial(), trial({ id: 'trial-2', date: '2026-10-25' })],
      classEvents: [classEvent()],
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ trialId: 'trial-1' });
  });

  it('gives a two-day show one block per day', () => {
    const events = select({
      trials: [trial(), trial({ id: 'trial-2', name: 'Load 1 Trial 2', date: '2026-10-25' })],
      classEvents: [
        classEvent({ classId: 'c1' }),
        classEvent({ classId: 'c3', trialDate: '2026-10-25' }, 'trial-2'),
      ],
      armbandsByTrialId: new Map([
        ['trial-1', new Set([314])],
        ['trial-2', new Set([314])],
      ]),
    });

    expect(events).toHaveLength(2);
    expect(events.map(e => (e.kind === 'trial' ? e.trialDate : null))).toEqual([
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('deduplicates class names in the block rather than repeating them', () => {
    const events = select({
      classEvents: [
        classEvent({ classId: 'c1', className: 'Novice Interiors' }),
        classEvent({ classId: 'c2', className: 'Novice Interiors' }),
      ],
    });
    expect(events[0]).toMatchObject({ classNames: ['Novice Interiors'] });
  });

  it('carries every armband so the builder can decide whether to name one', () => {
    const events = select({
      armbandsByTrialId: new Map([['trial-1', new Set([315, 314])]]),
    });
    expect(events[0]).toMatchObject({ armbands: [314, 315] });
  });
});

describe('resolveTrialZone', () => {
  it('uses the trial zone when it has one', () => {
    expect(resolveTrialZone(trial())).toBe('America/Chicago');
  });

  it('falls back for a trial predating the timezone column', () => {
    expect(resolveTrialZone(trial({ timezone: null }))).toBe(FALLBACK_TIME_ZONE);
    expect(resolveTrialZone(trial({ timezone: '   ' }))).toBe(FALLBACK_TIME_ZONE);
  });
});
