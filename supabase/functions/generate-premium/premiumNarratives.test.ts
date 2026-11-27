import { describe, expect, it } from 'vitest';

import {
  buildPremiumNarratives,
  formatNarrativeDate,
  formatNarrativeTime,
  narrativesForResponse,
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

  it("lists classes in the app's class order whatever order they arrive in", () => {
    const classes = [
      { id: '5', name: 'Interior', level: 'Master', element: 'Interior', section: null },
      { id: '4', name: 'Special Class', level: null, element: null },
      { id: '3', name: 'Containers', level: 'Excellent', element: 'Containers', section: 'B' },
      { id: '2', name: 'Containers', level: 'Excellent', element: 'Containers', section: 'A' },
      { id: '1', name: 'Containers', level: 'Novice', element: 'Containers', section: null },
    ];
    const build = (rows: typeof classes) =>
      buildPremiumNarratives({
        name: 'S',
        trials: [{ id: 't', name: 'T', date: '2027-03-03', registry_id: 'AKC', classes: rows }],
      }).trialInformation;
    const expected =
      'One trial is offered. T (March 3, 2027). ' +
      'Classes: Novice Containers, Excellent Containers (Section A), Excellent Containers (Section B), Master Interior, Special Class.';
    expect(build(classes)).toBe(expected);
    expect(build([...classes].reverse())).toBe(expected);
    expect(build([classes[2], classes[4], classes[0], classes[3], classes[1]])).toBe(expected);
  });

  it('prints the trial type as a readable label', () => {
    const type = (trial_type: string) =>
      buildPremiumNarratives({ name: 'S', trials: [{ id: 't', name: 'T', trial_type }] })
        .trialInformation;
    expect(type('scent_work')).toContain('T: Scent Work.');
    expect(type('OBEDIENCE_RALLY')).toContain('T: Obedience & Rally.');
    expect(type('fastcat')).toContain('T: FastCAT.');
    expect(type('akc_nosework')).toContain('T: AKC Nosework.');
  });

  it('reads a show with only a start date, or only an end date, as one date', () => {
    const trials = [{ id: 't', name: 'T', date: '2027-03-03', planned_start_time: '9:00 AM' }];
    expect(buildPremiumNarratives({ name: 'S', start_date: '2027-03-03', trials }).showHours).toBe(
      'S takes place on March 3, 2027. T (March 3, 2027) starts at 9:00 AM.'
    );
    expect(buildPremiumNarratives({ name: 'S', end_date: '2027-03-03', trials }).showHours).toBe(
      'S takes place on March 3, 2027. T (March 3, 2027) starts at 9:00 AM.'
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

describe('narrativesForResponse', () => {
  it('returns builtNarratives equal to buildPremiumNarratives even when narratives keeps a published edit', () => {
    const response = narrativesForResponse(
      { showHours: 'Edited by the secretary.', trialInformation: 'Old trial text.' },
      show
    );
    expect(response.builtNarratives).toEqual(buildPremiumNarratives(show));
    expect(response.narratives).toEqual({
      showHours: 'Edited by the secretary.',
      trialInformation: 'Old trial text.',
    });
  });

  it('returns the built text in both when nothing was published', () => {
    const response = narrativesForResponse({ showHours: '', trialInformation: '' }, show);
    expect(response.narratives).toEqual(response.builtNarratives);
  });
});
