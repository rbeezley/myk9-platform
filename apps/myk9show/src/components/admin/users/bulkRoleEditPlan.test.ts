import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import {
  buildRoleEditPlan,
  describeHolding,
  effectiveChoice,
  planToSteps,
  roleHoldings,
  summarizePlan,
} from './bulkRoleEditPlan';

function person(id: string, name: string, roles: UserRole[]): SelectedUser {
  const [firstName, lastName] = name.split(' ');
  return {
    id,
    user: { id, firstName, lastName, roles, createdAt: new Date(), updatedAt: new Date() },
  } as SelectedUser;
}

const selection = [
  person('1', 'Daniel Reyes', [UserRole.SECRETARY, UserRole.STEWARD, UserRole.EXHIBITOR]),
  person('2', 'Sam Whitfield', [UserRole.SECRETARY, UserRole.EXHIBITOR]),
  person('3', 'Lena Fischer', [UserRole.SECRETARY, UserRole.STEWARD]),
  person('4', 'Mei Chen', [UserRole.SECRETARY, UserRole.EXHIBITOR]),
];
const ROLES = ['secretary', 'judge', 'steward', 'exhibitor'] as const;
const holdings = roleHoldings(selection, ROLES);

describe('roleHoldings / describeHolding', () => {
  it('counts who holds each role now, with names', () => {
    expect(holdings.map(h => [h.role, h.holders])).toEqual([
      ['secretary', 4],
      ['judge', 0],
      ['steward', 2],
      ['exhibitor', 3],
    ]);
    expect(holdings[2]?.holderNames).toEqual(['Daniel Reyes', 'Lena Fischer']);
  });

  it('reads as all / none / N of M', () => {
    expect(describeHolding(4, 4)).toBe('all 4');
    expect(describeHolding(0, 4)).toBe('none');
    expect(describeHolding(2, 4)).toBe('2 of 4');
    expect(describeHolding(1, 1)).toBe('has it');
  });
});

describe('effectiveChoice', () => {
  it('collapses choices that cannot change anything to Keep', () => {
    expect(effectiveChoice('judge', 'remove', 0, 4)).toBe('keep');
    expect(effectiveChoice('steward', 'add', 4, 4)).toBe('keep');
    expect(effectiveChoice('exhibitor', 'remove', 3, 4)).toBe('keep'); // locked
  });

  it('keeps Add on a club-scoped role everyone holds — it may be for another club', () => {
    expect(effectiveChoice('secretary', 'add', 4, 4)).toBe('add');
  });
});

describe('buildRoleEditPlan / planToSteps / summarizePlan', () => {
  it('turns choices into remove-then-add steps and plain lines', () => {
    const plan = buildRoleEditPlan({ judge: 'add', steward: 'remove' }, holdings, 4);
    expect(plan).toEqual({ add: ['judge'], remove: ['steward'], needsClubs: false });

    expect(planToSteps(plan, [])).toEqual([
      { mode: 'remove', roleNames: ['steward'], clubIds: [] },
      { mode: 'add', roleNames: ['judge'], clubIds: [] },
    ]);

    expect(summarizePlan(plan, holdings, 4, 0)).toEqual([
      { tone: 'remove', text: 'Remove Steward from Daniel Reyes, Lena Fischer' },
      { tone: 'add', text: 'Add Judge to 4 people' },
    ]);
  });

  it('counts only the people who lack a role being added', () => {
    const plan = buildRoleEditPlan({ exhibitor: 'add', steward: 'add' }, holdings, 4);
    // Exhibitor is locked, so only Steward is added — to the two who lack it.
    expect(plan.add).toEqual(['steward']);
    expect(summarizePlan(plan, holdings, 4, 0)[0]?.text).toBe('Add Steward to 2 people');
  });

  it('needs clubs for a club-scoped change and names how many in the summary', () => {
    const plan = buildRoleEditPlan({ secretary: 'remove' }, holdings, 4);
    expect(plan.needsClubs).toBe(true);
    expect(summarizePlan(plan, holdings, 4, 2)[0]?.text).toBe(
      'Remove Secretary for 2 clubs from Daniel Reyes, Sam Whitfield, Lena Fischer and 1 more'
    );
    expect(planToSteps(plan, ['c1', 'c2'])).toEqual([
      { mode: 'remove', roleNames: ['secretary'], clubIds: ['c1', 'c2'] },
    ]);
  });

  it('an all-Keep plan has no steps', () => {
    const plan = buildRoleEditPlan({}, holdings, 4);
    expect(planToSteps(plan, [])).toEqual([]);
    expect(summarizePlan(plan, holdings, 4, 0)).toEqual([]);
  });
});
