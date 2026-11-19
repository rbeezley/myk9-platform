import { describe, expect, it } from 'vitest';

import {
  buildPremiumNarratives,
  formatNarrativeDate,
  formatNarrativeTime,
  resolvePremiumNarratives,
  type NarrativeShowRow,
} from './premiumNarratives.ts';

const show: NarrativeShowRow = {
  name: 'Fall Specialty',
  start_date: '2027-03-03',
  end_date: '2027-03-04',
  location: 'Old Barn',
  venue_name: 'Riverside Arena',
  city: 'Tulsa',
  state: 'OK',
  trials: [
    {
      id: 'b',
      name: 'Saturday Trial',
      date: '2027-03-04',
      planned_start_time: null,
      trial_type: 'Scent Work',
      status: 'upcoming',
      deleted_at: null,
      classes: [{ name: 'x', level: 'Novice', element: 'Interior' }],
    },
    {
      id: 'a',
      name: 'Friday Trial',
      date: '2027-03-03',
      planned_start_time: '08:30:00',
      trial_type: 'Scent Work',
      status: 'upcoming',
      deleted_at: null,
      classes: [
        { name: 'x', level: 'Novice', element: 'Containers' },
        { name: 'Gone', level: 'Novice', element: 'Buried', status: 'cancelled' },
        { name: 'Erased', level: 'Novice', element: 'Exterior', deleted_at: '2026-11-01' },
        { name: 'Special Class', level: null, element: null },
      ],
    },
    {
      id: 'c',
      name: 'Cancelled Trial',
      date: '2027-03-05',
      planned_start_time: '09:00:00',
      trial_type: 'Rally',
      status: 'cancelled',
      deleted_at: null,
      classes: [{ name: 'x', level: 'Rally', element: 'Hidden' }],
    },
  ],
};

describe('buildPremiumNarratives (MYK9-2055)', () => {
  it('builds Show Hours from dates, venue and start times, in schedule order', () => {
    expect(buildPremiumNarratives(show).showHours).toBe(
      'Fall Specialty runs March 3, 2027 to March 4, 2027 at Riverside Arena, Tulsa, OK. ' +
        'Friday Trial (March 3, 2027) starts at 8:30 AM. ' +
        'The start time for Saturday Trial will be announced.'
    );
  });

  it('builds Trial Information from live trials and live classes only', () => {
    expect(buildPremiumNarratives(show).trialInformation).toBe(
      '2 trials are offered. ' +
        'Friday Trial (March 3, 2027): Scent Work. Classes: Novice Containers, Special Class. ' +
        'Saturday Trial (March 4, 2027): Scent Work. Classes: Novice Interior.'
    );
  });

  it('gives the same text for the same show every time, whatever the trial order', () => {
    const first = buildPremiumNarratives(show);
    expect(buildPremiumNarratives(show)).toEqual(first);
    expect(buildPremiumNarratives({ ...show, trials: [...(show.trials ?? [])].reverse() })).toEqual(
      first
    );
  });

  it('never prints a cancelled trial or its classes', () => {
    const text = JSON.stringify(buildPremiumNarratives(show));
    expect(text).not.toContain('Cancelled Trial');
    expect(text).not.toContain('Hidden');
    expect(text).not.toContain('Buried');
  });

  it('says a one-day show happens on one date', () => {
    const built = buildPremiumNarratives({
      name: 'One Day',
      start_date: '2027-03-03',
      end_date: '2027-03-03',
      location: 'Old Barn',
      trials: [{ name: 'T1', date: '2027-03-03', planned_start_time: '1:30 PM', classes: [] }],
    });
    expect(built.showHours).toBe(
      'One Day takes place on March 3, 2027 at Old Barn. T1 (March 3, 2027) starts at 1:30 PM.'
    );
    expect(built.trialInformation).toBe('One trial is offered. T1 (March 3, 2027).');
  });

  it('returns blank narratives for a show with no live trial, never placeholder text', () => {
    expect(buildPremiumNarratives({ name: 'Empty', trials: [] })).toEqual({
      showHours: '',
      trialInformation: '',
    });
  });

  it('formats dates and times without time-zone drift or invention', () => {
    expect(formatNarrativeDate('2027-12-31')).toBe('December 31, 2027');
    expect(formatNarrativeDate('2027-12-31T23:30:00Z')).toBe('December 31, 2027');
    expect(formatNarrativeDate('soon')).toBe('');
    expect(formatNarrativeTime('00:05:00')).toBe('12:05 AM');
    expect(formatNarrativeTime('12:00')).toBe('12:00 PM');
    expect(formatNarrativeTime('TBD')).toBe('');
  });
});

describe('resolvePremiumNarratives', () => {
  const built = { showHours: 'Built hours.', trialInformation: 'Built info.' };

  it('keeps a published (possibly edited) narrative and fills only a blank one', () => {
    expect(
      resolvePremiumNarratives(
        { showHours: 'Edited by the secretary.', trialInformation: ' ' },
        built
      )
    ).toEqual({ showHours: 'Edited by the secretary.', trialInformation: 'Built info.' });
  });

  it('uses the built text when nothing was published', () => {
    expect(resolvePremiumNarratives({ showHours: '', trialInformation: '' }, built)).toEqual(built);
  });
});
