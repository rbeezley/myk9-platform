import { describe, it, expect } from 'vitest';
import type { AdminUser } from '@/hooks/queries/useUsersQuery';
import {
  chosenChanges,
  describeHolding,
  effectiveChoice,
  roleHoldings,
  summarizeBulkPlan,
} from './bulkRoleEditPlan';
import { planBulkRoleEdit, type RoleAssignment } from './bulkRolePlanner';

function person(id: string, name: string): [string, AdminUser] {
  const [firstName, lastName] = name.split(' ');
  return [
    id,
    { id, firstName, lastName, createdAt: new Date(), updatedAt: new Date() } as AdminUser,
  ];
}

function assignment(
  id: string,
  userId: string,
  role: string,
  extra: Partial<RoleAssignment> = {}
): RoleAssignment {
  return { id, userId, role, clubId: null, showId: null, expiresAt: null, ...extra };
}

const usersById = new Map([
  person('1', 'Daniel Reyes'),
  person('2', 'Sam Whitfield'),
  person('3', 'Lena Fischer'),
  person('4', 'Mei Chen'),
]);
const ids = [...usersById.keys()];
const ROLES = ['secretary', 'judge', 'steward', 'exhibitor'] as const;

const baseAssignments: RoleAssignment[] = [
  assignment('1-sec', '1', 'secretary', { clubId: 'c1' }),
  assignment('1-st', '1', 'steward'),
  assignment('2-sec', '2', 'secretary', { clubId: 'c1' }),
  assignment('3-sec', '3', 'secretary', { clubId: 'c1' }),
  assignment('3-st', '3', 'steward'),
  assignment('4-sec', '4', 'secretary', { clubId: 'c1' }),
];
const holdings = roleHoldings(ids, baseAssignments, ROLES);

/** Plan exactly as the panel does: chosen changes → planner → summary. */
function summaryFor(
  choices: Record<string, 'add' | 'remove'>,
  assignments: RoleAssignment[],
  clubIds: string[] = []
) {
  const h = roleHoldings(ids, assignments, ROLES);
  const chosen = chosenChanges(choices, h, ids.length);
  const plan = planBulkRoleEdit({
    userIds: ids,
    assignments,
    add: chosen.add,
    remove: chosen.remove,
    clubIds,
  });
  return summarizeBulkPlan(plan, chosen, ids, usersById, clubIds.length);
}

describe('roleHoldings / describeHolding', () => {
  it('counts who holds each role now', () => {
    expect(holdings.map(h => [h.role, h.holders])).toEqual([
      ['secretary', 4],
      ['judge', 0],
      ['steward', 2],
      ['exhibitor', 0],
    ]);
  });

  it('reads as all / none / N of M', () => {
    expect(describeHolding(4, 4)).toBe('all 4');
    expect(describeHolding(0, 4)).toBe('none');
    expect(describeHolding(2, 4)).toBe('2 of 4');
    expect(describeHolding(1, 1)).toBe('has it');
  });

  // MYK9-820 (Codex P2, round 3 on bulkRoleEditPlan.ts:53-55): holdings must
  // read the SAME scope the planner uses for "already active" — a show-limited
  // grant does not count as holding a non-club role, so it must not disable Add.
  it('does not count a show-limited grant as "holding" a non-club role', () => {
    const showLimited = [assignment('j-show', '1', 'judge', { showId: 'show-1' })];
    const h = roleHoldings(ids, showLimited, ['judge']);
    expect(h).toEqual([{ role: 'judge', holders: 0 }]);
  });

  it('does count a club-scoped role in ANY scope as "holding" it', () => {
    const showLimitedSecretary = [
      assignment('s-show', '1', 'secretary', { clubId: 'c1', showId: 'show-1' }),
    ];
    const h = roleHoldings(ids, showLimitedSecretary, ['secretary']);
    expect(h).toEqual([{ role: 'secretary', holders: 1 }]);
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

  // MYK9-820 round-3 fix: everyone selected holds `judge` ONLY via a show-limited
  // grant, so scope-aware holders is 0 — Add must stay available (it collapsed
  // to Keep under the old flattened-role-name count, which read 4 of 4).
  it('keeps Add available when everyone holds the role only via a show-limited grant', () => {
    const showLimitedForAll = ids.map(id => assignment(`${id}-j`, id, 'judge', { showId: 's1' }));
    const h = roleHoldings(ids, showLimitedForAll, ['judge']);
    const judgeHolders = h.find(x => x.role === 'judge')!.holders;
    expect(judgeHolders).toBe(0);
    expect(effectiveChoice('judge', 'add', judgeHolders, ids.length)).toBe('add');

    const plan = planBulkRoleEdit({
      userIds: ids,
      assignments: showLimitedForAll,
      add: ['judge'],
      remove: [],
      clubIds: [],
    });
    // The planner grants a permanent judge role to everyone — the show-limited
    // grant does not block it.
    expect(plan.people.every(p => p.add.some(a => a.role === 'judge'))).toBe(true);
    expect(plan.people).toHaveLength(ids.length);
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
