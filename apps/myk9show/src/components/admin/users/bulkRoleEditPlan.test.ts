import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';
import {
  chosenChanges,
  describeHolding,
  effectiveChoice,
  roleHoldings,
  summarizeBulkPlan,
} from './bulkRoleEditPlan';
import { planBulkRoleEdit, type RoleAssignment } from './bulkRolePlanner';

function person(id: string, name: string, roles: UserRole[]): SelectedUser {
  const [firstName, lastName] = name.split(' ');
  return {
    id,
    user: { id, firstName, lastName, roles, createdAt: new Date(), updatedAt: new Date() },
  } as SelectedUser;
}

function assignment(
  id: string,
  userId: string,
  role: string,
  extra: Partial<RoleAssignment> = {}
): RoleAssignment {
  return { id, userId, role, clubId: null, showId: null, expiresAt: null, ...extra };
}

const selection = [
  person('1', 'Daniel Reyes', [UserRole.SECRETARY, UserRole.STEWARD, UserRole.EXHIBITOR]),
  person('2', 'Sam Whitfield', [UserRole.SECRETARY, UserRole.EXHIBITOR]),
  person('3', 'Lena Fischer', [UserRole.SECRETARY, UserRole.STEWARD]),
  person('4', 'Mei Chen', [UserRole.SECRETARY, UserRole.EXHIBITOR]),
];
const ids = selection.map(p => p.id);
const ROLES = ['secretary', 'judge', 'steward', 'exhibitor'] as const;
const holdings = roleHoldings(selection, ROLES);

/** Plan exactly as the panel does: chosen changes → planner → summary. */
function summaryFor(
  choices: Record<string, 'add' | 'remove'>,
  assignments: RoleAssignment[],
  clubIds: string[] = []
) {
  const chosen = chosenChanges(choices, holdings, selection.length);
  const plan = planBulkRoleEdit({
    userIds: ids,
    assignments,
    add: chosen.add,
    remove: chosen.remove,
    clubIds,
  });
  return summarizeBulkPlan(plan, chosen, selection, clubIds.length);
}

describe('roleHoldings / describeHolding', () => {
  it('counts who holds each role now', () => {
    expect(holdings.map(h => [h.role, h.holders])).toEqual([
      ['secretary', 4],
      ['judge', 0],
      ['steward', 2],
      ['exhibitor', 3],
    ]);
  });

  it('reads as all / none / N of M', () => {
    expect(describeHolding(4, 4)).toBe('all 4');
    expect(describeHolding(0, 4)).toBe('none');
    expect(describeHolding(2, 4)).toBe('2 of 4');
    expect(describeHolding(1, 1)).toBe('has it');
  });
});

describe('effectiveChoice / chosenChanges', () => {
  it('collapses choices that cannot change anything to Keep', () => {
    expect(effectiveChoice('judge', 'remove', 0, 4)).toBe('keep');
    expect(effectiveChoice('steward', 'add', 4, 4)).toBe('keep');
    expect(effectiveChoice('exhibitor', 'remove', 3, 4)).toBe('keep'); // locked
  });

  it('keeps Add on a club-scoped role everyone holds — it may be for another club', () => {
    expect(effectiveChoice('secretary', 'add', 4, 4)).toBe('add');
  });

  it('lists the chosen roles and whether clubs are needed', () => {
    expect(chosenChanges({ judge: 'add', steward: 'remove' }, holdings, 4)).toEqual({
      add: ['judge'],
      remove: ['steward'],
      needsClubs: false,
    });
    expect(chosenChanges({ secretary: 'remove' }, holdings, 4).needsClubs).toBe(true);
  });
});

describe('summarizeBulkPlan renders only the plan', () => {
  it('names who loses a role and counts who gains one', () => {
    expect(
      summaryFor({ judge: 'add', steward: 'remove' }, [
        assignment('d-st', '1', 'steward'),
        assignment('l-st', '3', 'steward'),
      ])
    ).toEqual([
      { tone: 'remove', text: 'Remove Steward from Daniel Reyes, Lena Fischer' },
      { tone: 'add', text: 'Add Judge to 4 people' },
    ]);
  });

  // Codex P2 (round 2): a role held only through a show-limited or expiring
  // grant is not removed, so it must not be listed as removed.
  it('lists a show-limited or expiring holder as unchanged, not removed', () => {
    expect(
      summaryFor({ steward: 'remove' }, [
        assignment('d-st', '1', 'steward', { showId: 'show-1' }),
        assignment('l-st', '3', 'steward', { expiresAt: '2026-12-31' }),
      ])
    ).toEqual([
      {
        tone: 'note',
        text: 'Steward stays for Daniel Reyes, Lena Fischer: limited to one show or with an end date',
      },
    ]);
  });

  // Codex P2 (round 1, kept): only holders for a chosen club are named.
  it('names only people who hold a club-scoped role for a chosen club', () => {
    expect(
      summaryFor(
        { secretary: 'remove' },
        [
          assignment('d', '1', 'secretary', { clubId: 'c1' }),
          assignment('s', '2', 'secretary', { clubId: 'c2' }),
          assignment('l', '3', 'secretary'),
        ],
        ['c1']
      )
    ).toEqual([{ tone: 'remove', text: 'Remove Secretary for 1 club from Daniel Reyes' }]);
  });

  it('says so when nobody holds the role for the chosen club', () => {
    expect(
      summaryFor(
        { secretary: 'remove' },
        [assignment('s', '2', 'secretary', { clubId: 'c2' })],
        ['c1']
      )
    ).toEqual([
      {
        tone: 'note',
        text: 'Nobody selected holds Secretary for the chosen club — nothing to remove',
      },
    ]);
  });

  it('counts only the people who lack a role being added', () => {
    expect(
      summaryFor({ steward: 'add' }, [
        assignment('d-st', '1', 'steward'),
        assignment('l-st', '3', 'steward'),
      ])
    ).toEqual([{ tone: 'add', text: 'Add Steward to 2 people' }]);
  });

  it('shortens a long name list', () => {
    const everyone = ids.map(id => assignment(`sec-${id}`, id, 'secretary', { clubId: 'c1' }));
    expect(summaryFor({ secretary: 'remove' }, everyone, ['c1', 'c2'])[0]?.text).toBe(
      'Remove Secretary for 2 clubs from Daniel Reyes, Sam Whitfield, Lena Fischer and 1 more'
    );
  });

  it('an all-Keep choice has an empty plan and no lines', () => {
    expect(summaryFor({}, [])).toEqual([]);
  });
});
