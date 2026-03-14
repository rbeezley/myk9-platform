import { describe, it, expect } from 'vitest';
import { summarizeSchedule, type ScheduleClassRow } from './schedule-summary';

describe('summarizeSchedule', () => {
  it('groups classes by date and discipline', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'Novice Buried',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Open',
        name: 'Open Buried',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Container',
        level: 'Novice',
        name: 'Novice Container',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'Novice Obedience',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Open',
        name: 'Open Obedience',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result).toHaveLength(2);
    expect(result[0].date).toBe('2026-06-13');
    expect(result[0].disciplines).toHaveLength(1);
    expect(result[0].disciplines[0].name).toBe('Scent Work');
    expect(result[0].disciplines[0].elements).toEqual(['Buried', 'Container']);
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open']);
    expect(result[1].date).toBe('2026-06-14');
    expect(result[1].disciplines).toHaveLength(1);
    expect(result[1].disciplines[0].name).toBe('Obedience');
    expect(result[1].disciplines[0].elements).toEqual([]);
    expect(result[1].disciplines[0].levels).toEqual(['Novice', 'Open']);
  });

  it('handles multi-discipline days', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-14',
        discipline: 'Scent Work',
        element: 'Interior',
        level: 'Master',
        name: 'Master Interior',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Utility',
        name: 'Utility Obedience',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Rally',
        element: null,
        level: 'Novice',
        name: 'Novice Rally',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Rally',
        element: null,
        level: 'Master',
        name: 'Master Rally',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result).toHaveLength(1);
    expect(result[0].disciplines).toHaveLength(3);
    expect(result[0].disciplines.map(d => d.name)).toEqual(['Obedience', 'Rally', 'Scent Work']);
  });

  it('puts classes with null discipline into "Other" group', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: null,
        element: null,
        level: null,
        name: 'Special Exhibition',
      },
      {
        trialDate: '2026-06-13',
        discipline: null,
        element: null,
        level: null,
        name: 'Junior Showmanship',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result).toHaveLength(1);
    expect(result[0].disciplines).toHaveLength(1);
    expect(result[0].disciplines[0].name).toBe('Other');
    expect(result[0].disciplines[0].classNames).toEqual([
      'Junior Showmanship',
      'Special Exhibition',
    ]);
  });

  it('returns empty array for no input', () => {
    expect(summarizeSchedule([])).toEqual([]);
  });

  it('deduplicates elements and levels', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'A',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'B',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result[0].disciplines[0].elements).toEqual(['Buried']);
    expect(result[0].disciplines[0].levels).toEqual(['Novice']);
  });

  it('sorts dates chronologically', () => {
    const rows: ScheduleClassRow[] = [
      { trialDate: '2026-06-15', discipline: 'Rally', element: null, level: 'Novice', name: 'A' },
      { trialDate: '2026-06-13', discipline: 'Obedience', element: null, level: 'Open', name: 'B' },
      {
        trialDate: '2026-06-14',
        discipline: 'Scent Work',
        element: 'Interior',
        level: 'Master',
        name: 'C',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result.map(d => d.date)).toEqual(['2026-06-13', '2026-06-14', '2026-06-15']);
  });

  it('handles single-class days', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Detective',
        level: 'Master',
        name: 'Master Detective',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result).toHaveLength(1);
    expect(result[0].disciplines[0].elements).toEqual(['Detective']);
    expect(result[0].disciplines[0].levels).toEqual(['Master']);
  });

  it('sorts levels by progression order, not alphabetically', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Utility',
        name: 'A',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'B',
      },
      { trialDate: '2026-06-13', discipline: 'Obedience', element: null, level: 'Open', name: 'C' },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Master',
        name: 'D',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open', 'Utility', 'Master']);
  });

  it('skips null elements but keeps null levels', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'Novice Obedience',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Open',
        name: 'Open Obedience',
      },
    ];

    const result = summarizeSchedule(rows);
    expect(result[0].disciplines[0].elements).toEqual([]);
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open']);
  });
});
