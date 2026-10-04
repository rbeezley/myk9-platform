/**
 * MYK9-986: the Select classes table counted raw entry rows, read only
 * start_time (null on every demo class) and treated stored trial types as
 * display labels. Fixtures use the demo show's data shape (Heartland Scent
 * Work Classic: scent_work trial, Exterior Excellent with one submitted and
 * two withdrawn entries, no start_time, revised_expected_start 7:30 AM CDT).
 */
import { describe, it, expect } from 'vitest';
import { isScentTrialType } from '@/types/template.types';
import type { Trial } from '@/components/trials/types/trial.types';
import { classTimeLabel, countExpectedEntriesByClass } from '../ShowDetailsPage.classRows';
import { buildPublicShowClasses, buildPublicTrialStats } from '../ShowDetailsPage.publicClasses';

const CLASS_ID = 'class-ext-excellent';

const demoEntries = [
  { class_id: CLASS_ID, entry_status: 'submitted', check_in_status: 'no-status', is_scored: false },
  { class_id: CLASS_ID, entry_status: 'withdrawn', check_in_status: 'no-status', is_scored: false },
  { class_id: CLASS_ID, entry_status: 'withdrawn', check_in_status: 'no-status', is_scored: false },
];

describe('countExpectedEntriesByClass', () => {
  it('counts the entries a class is expected to run, not the raw rows', () => {
    expect(demoEntries).toHaveLength(3);
    expect(countExpectedEntriesByClass(demoEntries).get(CLASS_ID)).toBe(1);
  });

  it('leaves out scratched, soft-deleted and pulled entries too', () => {
    const counts = countExpectedEntriesByClass([
      { class_id: 'c', entry_status: 'confirmed' },
      { class_id: 'c', entry_status: 'scratched' },
      { class_id: 'c', entry_status: 'confirmed', deleted_at: '2026-10-01T00:00:00Z' },
      { class_id: 'c', entry_status: 'confirmed', check_in_status: 'pulled' },
      { class_id: 'other', entry_status: 'confirmed' },
    ]);
    expect(counts.get('c')).toBe(1);
    expect(counts.get('other')).toBe(1);
  });
});

describe('classTimeLabel', () => {
  it('falls back to the revised expected start, in the trial time zone, when start_time is null', () => {
    expect(
      classTimeLabel(
        { startTime: '', revisedExpectedStart: '2026-10-10T12:30:00.000Z' },
        'America/Chicago'
      )
    ).toBe('7:30 AM');
  });

  it('prefers the planned start, and is blank only when the class has neither', () => {
    expect(
      classTimeLabel(
        { startTime: '09:00:00', revisedExpectedStart: '2026-10-10T12:30:00.000Z' },
        'America/Chicago'
      )
    ).toBe('9:00 AM');
    expect(classTimeLabel({ startTime: '', revisedExpectedStart: null }, 'America/Chicago')).toBe(
      ''
    );
  });
});

describe('isScentTrialType', () => {
  it.each(['scent_work', 'nosework', 'scent_detection', 'Scent Work', 'Nosework'])(
    'treats the stored or display value %s as a scent sport',
    value => expect(isScentTrialType(value)).toBe(true)
  );

  it.each(['agility', 'Agility', 'obedience', '', undefined])(
    'does not treat %s as a scent sport',
    value => expect(isScentTrialType(value)).toBe(false)
  );
});

describe('public class rows (cold-store path)', () => {
  const trial = { id: 't1', name: 'Saturday', timezone: 'America/Chicago' } as unknown as Trial;
  const rows = [
    {
      id: CLASS_ID,
      element: 'Exterior',
      level: 'Excellent',
      section: null,
      status: 'scheduled',
      start_time: null,
      revised_expected_start: '2026-10-10T12:30:00.000Z',
    },
  ];

  it('shows the revised start and the expected-entry count, matching the schedule card', () => {
    const [row] = buildPublicShowClasses(
      [trial],
      [{ trialId: 't1', rows }],
      demoEntries as unknown as Record<string, unknown>[]
    );
    expect(row?.time).toBe('7:30 AM');
    expect(row?.entryCount).toBe(1);

    const stats = buildPublicTrialStats(
      [{ trialId: 't1', rows }],
      demoEntries as unknown as Record<string, unknown>[]
    );
    expect(stats.t1?.entryCount).toBe(1);
  });
});
