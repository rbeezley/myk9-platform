import { describe, expect, it } from 'vitest';
import type { ShowOfficials } from '@/hooks/queries/useShowOfficials';
import { buildHospitalityPlanDay } from '../hospitalityPlan';
import { resolveJudgesOnDays, type JudgeAssignmentInput } from '../judgesOnDays';
import type { LunchOrderRow } from '../lunchOrders';
import type { VolunteerOnDay } from '../useLunchOrders';

const DAYS = ['sat', 'sun'];

// Real assignment shapes: a class-scoped row (trial_id NULL) and a show-wide row.
const assignments: JudgeAssignmentInput[] = [
  {
    id: 'a1',
    person_id: 'j-ann',
    status: 'confirmed',
    class_id: 'c1',
    trial_id: null,
    class: { trial_id: 'sat' },
    people: { first_name: 'Ann', last_name: 'Adams' },
  },
  {
    id: 'a2',
    person_id: 'j-bo',
    status: 'invited',
    class_id: null,
    trial_id: null,
    class: null,
    people: { first_name: 'Bo', last_name: 'Baker' },
  },
  {
    id: 'a3',
    person_id: 'j-cy',
    status: 'declined',
    class_id: null,
    trial_id: null,
    class: null,
    people: { first_name: 'Cy', last_name: 'Cole' },
  },
];

const officials: ShowOfficials = {
  secretaries: [
    { personId: 's1', firstName: 'Sue', lastName: 'Sharp', email: null, role: 'secretary' },
  ],
  stewards: [
    { personId: 'st1', firstName: 'Stan', lastName: 'Stone', email: null, role: 'steward' },
    // Bo is a show-wide judge who also stewards.
    { personId: 'j-bo', firstName: 'Bo', lastName: 'Baker', email: null, role: 'steward' },
  ],
  chairmen: [],
};

const volunteers: VolunteerOnDay[] = [
  { personId: 'v1', name: 'Vic Vance', trialId: null },
  { personId: 'v2', name: 'Wes West', trialId: 'sun' },
];

function saved(
  overrides: Partial<LunchOrderRow> & Pick<LunchOrderRow, 'id' | 'name'>
): LunchOrderRow {
  return {
    trial_id: 'sat',
    person_id: null,
    role: 'other',
    lunch_order: null,
    dietary_note: null,
    ...overrides,
  };
}

const judgesByDay = resolveJudgesOnDays(DAYS, assignments);

function day(trialId: string, rows: LunchOrderRow[]) {
  return buildHospitalityPlanDay({
    trialId,
    saved: rows,
    judges: judgesByDay.get(trialId) ?? [],
    officials,
    volunteers,
  });
}

describe('buildHospitalityPlanDay', () => {
  it('counts each assigned person once, by role, with names, for a day with no lunch orders', () => {
    const plan = day('sat', []);

    expect(plan.roles.map(r => [r.role, r.count, r.names])).toEqual([
      ['judge', 2, ['Ann Adams', 'Bo Baker']],
      ['steward', 1, ['Stan Stone']],
      ['secretary', 1, ['Sue Sharp']],
      ['volunteer', 1, ['Vic Vance']],
    ]);
    // Bo is a judge and a steward: counted once, under the higher-priority role.
    expect(plan.total).toBe(5);
    expect(plan.orders).toEqual([]);
  });

  it('puts a class-scoped judge on their own day only and a day volunteer on that day only', () => {
    const sun = day('sun', []);

    expect(sun.roles.find(r => r.role === 'judge')?.names).toEqual(['Bo Baker']);
    expect(sun.roles.find(r => r.role === 'volunteer')?.names).toEqual(['Vic Vance', 'Wes West']);
  });

  it('keeps a declined judge out of the headcount', () => {
    expect(day('sat', []).roles.flatMap(r => r.names)).not.toContain('Cy Cole');
  });

  it('counts someone added only through the lunch list, and lists their order', () => {
    const plan = day('sat', [
      saved({ id: 'r1', name: 'Pat Exhibitor', role: 'exhibitor', lunch_order: 'Turkey wrap' }),
    ]);

    expect(plan.total).toBe(6);
    expect(plan.roles.find(r => r.role === 'exhibitor')).toEqual({
      role: 'exhibitor',
      label: 'Exhibitor',
      count: 1,
      names: ['Pat Exhibitor'],
    });
    expect(plan.orders.map(o => [o.name, o.lunchOrder])).toEqual([
      ['Pat Exhibitor', 'Turkey wrap'],
    ]);
  });

  it('shows a typed order and dietary note on an assigned person, not a duplicate headcount', () => {
    const plan = day('sat', [
      saved({
        id: 'r2',
        name: 'Ann Adams',
        person_id: 'j-ann',
        role: 'judge',
        lunch_order: 'Chicken salad',
        dietary_note: 'No nuts',
      }),
    ]);

    expect(plan.total).toBe(5);
    expect(plan.orders).toHaveLength(1);
    expect(plan.orders[0]).toMatchObject({
      name: 'Ann Adams',
      lunchOrder: 'Chicken salad',
      dietaryNote: 'No nuts',
    });
  });

  it('lists a dietary note with no order, and skips a saved row with neither', () => {
    const plan = day('sat', [
      saved({ id: 'r3', name: 'Dee Dietary', dietary_note: 'Vegan' }),
      saved({ id: 'r4', name: 'Eve Empty' }),
    ]);

    expect(plan.orders.map(o => o.name)).toEqual(['Dee Dietary']);
    expect(plan.total).toBe(7);
  });
});
