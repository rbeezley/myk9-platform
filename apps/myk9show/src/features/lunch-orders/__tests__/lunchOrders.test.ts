import { describe, expect, it } from 'vitest';
import { collectLunchCandidates } from '../lunchCandidates';
import { generalAssignmentScope } from '../useLunchOrders';
import { buildLunchOrderList, cleanLunchText, type LunchOrderRow } from '../lunchOrders';

const officials = {
  secretaries: [
    { personId: 'p-sec', firstName: 'Sam', lastName: 'Secretary', email: null, role: 'secretary' },
  ],
  chairmen: [],
  stewards: [
    { personId: 'p-stew', firstName: 'Stu', lastName: 'Steward', email: null, role: 'steward' },
  ],
} as const;

describe('collectLunchCandidates (real assignment shapes)', () => {
  it('lists the day judges, the show officials, and that day volunteers only', () => {
    const candidates = collectLunchCandidates({
      trialId: 'day-1',
      judges: [{ person_id: 'p-judge', judge_name: 'Jo Judge' }],
      officials: {
        secretaries: [...officials.secretaries],
        chairmen: [],
        stewards: [...officials.stewards],
      },
      volunteers: [
        { personId: 'p-v1', name: 'Vic Volunteer', trialId: 'day-1' },
        { personId: 'p-v2', name: 'Other Day', trialId: 'day-2' },
        { personId: null, name: 'All Weekend', trialId: null },
      ],
    });

    expect(candidates).toEqual([
      { personId: 'p-judge', name: 'Jo Judge', role: 'judge' },
      { personId: 'p-sec', name: 'Sam Secretary', role: 'secretary' },
      { personId: 'p-stew', name: 'Stu Steward', role: 'steward' },
      { personId: 'p-v1', name: 'Vic Volunteer', role: 'volunteer' },
      { personId: null, name: 'All Weekend', role: 'volunteer' },
    ]);
  });
});

describe('buildLunchOrderList', () => {
  const candidates = [
    { personId: 'p-judge', name: 'Jo Judge', role: 'judge' as const },
    { personId: 'p-v1', name: 'Vic Volunteer', role: 'volunteer' as const },
    { personId: 'p-judge', name: 'Jo Judge', role: 'steward' as const },
  ];

  it('seeds everyone assigned with empty fields and writes nothing', () => {
    const items = buildLunchOrderList([], candidates);

    expect(items.map(item => [item.name, item.role, item.savedId, item.lunchOrder])).toEqual([
      ['Jo Judge', 'judge', null, ''],
      ['Vic Volunteer', 'volunteer', null, ''],
    ]);
    expect(items.every(item => item.assigned)).toBe(true);
  });

  it('shows saved text on the matching person and keeps added people after assigned ones of the same role', () => {
    const saved: LunchOrderRow[] = [
      {
        id: 'row-1',
        trial_id: 'day-1',
        person_id: 'p-v1',
        name: 'Vic Volunteer',
        role: 'volunteer',
        lunch_order: 'Turkey wrap',
        dietary_note: 'No dairy',
      },
      {
        id: 'row-2',
        trial_id: 'day-1',
        person_id: null,
        name: 'Ann Exhibitor',
        role: 'exhibitor',
        lunch_order: null,
        dietary_note: null,
      },
    ];

    const items = buildLunchOrderList(saved, candidates);

    const vic = items.find(item => item.name === 'Vic Volunteer');
    expect(vic).toMatchObject({
      savedId: 'row-1',
      lunchOrder: 'Turkey wrap',
      dietaryNote: 'No dairy',
    });
    const ann = items.find(item => item.name === 'Ann Exhibitor');
    expect(ann).toMatchObject({ savedId: 'row-2', assigned: false, role: 'exhibitor' });
    expect(items).toHaveLength(3);
  });

  it('matches a saved free-name row to the same-named volunteer without a person id', () => {
    const items = buildLunchOrderList(
      [
        {
          id: 'row-3',
          trial_id: 'day-1',
          person_id: null,
          name: 'all weekend',
          role: 'volunteer',
          lunch_order: 'Soup',
          dietary_note: null,
        },
      ],
      [{ personId: null, name: 'All Weekend', role: 'volunteer' }]
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ savedId: 'row-3', lunchOrder: 'Soup', assigned: true });
  });
});

describe('cleanLunchText', () => {
  it('stores blank text as null and trims the rest', () => {
    expect(cleanLunchText('   ')).toBeNull();
    expect(cleanLunchText(' Chicken salad ')).toBe('Chicken salad');
  });
});

describe('generalAssignmentScope', () => {
  it('matches a duty by its show or by any of the show day ids', () => {
    expect(generalAssignmentScope('show-1', ['t-1', 't-2'])).toBe(
      'show_id.eq.show-1,trial_id.in.(t-1,t-2)'
    );
    expect(generalAssignmentScope('show-1', [])).toBe('show_id.eq.show-1');
  });
});
