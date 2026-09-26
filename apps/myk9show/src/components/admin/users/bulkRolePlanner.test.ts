import { describe, it, expect, vi, beforeEach } from 'vitest';

// A fake PostgREST: every active assignment row lives in `rows`, and the query
// honours .in(user_id), .order(id) and .range(from, to) exactly as the real one
// does — including the 1,000-row cap that makes an unpaged read truncate.
const rows = vi.hoisted(() => ({ value: [] as Record<string, unknown>[] }));
const rangeCalls = vi.hoisted(() => [] as Array<[number, number]>);
const failWith = vi.hoisted(() => ({ value: null as Error | null }));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: () => {
      let ids: string[] = [];
      const query = {
        select: () => query,
        in: (_col: string, values: string[]) => {
          ids = values;
          return query;
        },
        eq: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          rangeCalls.push([from, to]);
          if (failWith.value) return Promise.resolve({ data: null, error: failWith.value });
          const matching = rows.value
            .filter(r => ids.includes(r.user_id as string))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
          return Promise.resolve({ data: matching.slice(from, to + 1), error: null });
        },
      };
      return query;
    },
  },
}));

const revokeUserRole = vi.hoisted(() => vi.fn());
const ensureUserHasRole = vi.hoisted(() => vi.fn());
vi.mock('@/services/rbac/RBACService', () => ({
  rbacService: { revokeUserRole, ensureUserHasRole },
}));

import {
  ASSIGNMENT_PAGE_SIZE,
  fetchActiveAssignments,
  planBulkRoleEdit,
  plannedRemovals,
  plansEqual,
  type RoleAssignment,
} from './bulkRolePlanner';
import { executePersonPlan } from './bulkRoleRunner';

function row(
  id: string,
  userId: string,
  role: string,
  extra: { club_id?: string | null; show_id?: string | null; expires_at?: string | null } = {}
) {
  return {
    id,
    user_id: userId,
    club_id: null,
    show_id: null,
    expires_at: null,
    roles: { name: role },
    ...extra,
  };
}

function assignment(
  id: string,
  userId: string,
  role: string,
  extra: Partial<RoleAssignment> = {}
): RoleAssignment {
  return { id, userId, role, clubId: null, showId: null, expiresAt: null, ...extra };
}

beforeEach(() => {
  rows.value = [];
  rangeCalls.length = 0;
  failWith.value = null;
  revokeUserRole.mockReset().mockResolvedValue(undefined);
  ensureUserHasRole.mockReset().mockResolvedValue(true);
});

describe('fetchActiveAssignments', () => {
  it('pages past the 1,000-row cap, so a grant on page 2 is not dropped', async () => {
    // 1,000 filler rows sort before the one that matters.
    rows.value = [
      ...Array.from({ length: ASSIGNMENT_PAGE_SIZE }, (_, i) =>
        row(`a${String(i).padStart(4, '0')}`, 'filler', 'exhibitor')
      ),
      row('z-sam-secretary', 'sam', 'secretary', { club_id: 'c1' }),
    ];

    const assignments = await fetchActiveAssignments(['filler', 'sam']);

    expect(assignments).toHaveLength(ASSIGNMENT_PAGE_SIZE + 1);
    expect(rangeCalls).toEqual([
      [0, ASSIGNMENT_PAGE_SIZE - 1],
      [ASSIGNMENT_PAGE_SIZE, 2 * ASSIGNMENT_PAGE_SIZE - 1],
    ]);
    const plan = planBulkRoleEdit({
      userIds: ['filler', 'sam'],
      assignments,
      add: [],
      remove: ['secretary'],
      clubIds: ['c1'],
    });
    expect(plan.people.map(p => [p.userId, p.remove.map(a => a.id)])).toEqual([
      ['sam', ['z-sam-secretary']],
    ]);
  });

  it('throws on a read failure instead of returning a partial list', async () => {
    failWith.value = new Error('permission denied');
    await expect(fetchActiveAssignments(['sam'])).rejects.toThrow('permission denied');
  });
});

describe('planBulkRoleEdit', () => {
  it('leaves a show-limited or expiring grant alone, even for a non-club role', () => {
    const plan = planBulkRoleEdit({
      userIds: ['carol', 'dan'],
      assignments: [
        assignment('c-judge', 'carol', 'judge', { showId: 'show-1' }),
        assignment('d-judge', 'dan', 'judge', { expiresAt: '2026-12-31' }),
      ],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    expect(plan.people).toEqual([]);
    expect(plan.leftUnchanged.map(a => a.id)).toEqual(['c-judge', 'd-judge']);
  });

  it('removes a club-scoped role only for the chosen clubs', () => {
    const plan = planBulkRoleEdit({
      userIds: ['daniel', 'sam', 'legacy'],
      assignments: [
        assignment('d-sec', 'daniel', 'secretary', { clubId: 'c2' }), // other club
        assignment('s-sec', 'sam', 'secretary', { clubId: 'c1' }),
        assignment('l-sec', 'legacy', 'secretary'), // no club at all
      ],
      add: [],
      remove: ['secretary'],
      clubIds: ['c1'],
    });
    expect(plan.people.map(p => [p.userId, p.remove.map(a => a.id)])).toEqual([['sam', ['s-sec']]]);
  });

  it('revokes by assignment row, keeping a protected grant of the same role', () => {
    const plan = planBulkRoleEdit({
      userIds: ['eve'],
      assignments: [
        assignment('e-judge', 'eve', 'judge'),
        assignment('e-judge-show', 'eve', 'judge', { showId: 'show-1' }),
      ],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    expect(plan.people[0]?.remove.map(a => a.id)).toEqual(['e-judge']);
    expect(plan.leftUnchanged.map(a => a.id)).toEqual(['e-judge-show']);
  });

  it('adds only where ensureUserHasRole would not already find it active', () => {
    const plan = planBulkRoleEdit({
      userIds: ['has-it', 'show-only', 'lacks'],
      assignments: [
        assignment('h', 'has-it', 'steward'),
        // A show-limited grant does not count: ensureUserHasRole looks for show_id IS NULL.
        assignment('s', 'show-only', 'steward', { showId: 'show-1' }),
      ],
      add: ['steward', 'secretary'],
      remove: [],
      clubIds: ['c1', 'c2'],
    });
    expect(plan.people.map(p => [p.userId, p.add])).toEqual([
      [
        'has-it',
        [
          { role: 'secretary', clubId: 'c1' },
          { role: 'secretary', clubId: 'c2' },
        ],
      ],
      [
        'show-only',
        [
          { role: 'steward', clubId: null },
          { role: 'secretary', clubId: 'c1' },
          { role: 'secretary', clubId: 'c2' },
        ],
      ],
      [
        'lacks',
        [
          { role: 'steward', clubId: null },
          { role: 'secretary', clubId: 'c1' },
          { role: 'secretary', clubId: 'c2' },
        ],
      ],
    ]);
  });

  // MYK9-820 design rule: "The current admin can never suspend or strip
  // themselves." A bulk Remove chosen for everyone must still leave the
  // signed-in admin's own unprotected grant alone.
  it("never removes the current admin's own role, even when they are selected and eligible", () => {
    const plan = planBulkRoleEdit({
      userIds: ['me', 'other'],
      assignments: [assignment('me-judge', 'me', 'judge'), assignment('o-judge', 'other', 'judge')],
      add: [],
      remove: ['judge'],
      clubIds: [],
      currentUserId: 'me',
    });
    expect(plan.people.map(p => p.userId)).toEqual(['other']);
    expect(plan.leftUnchanged).toEqual([]);
  });

  it('still lets the current admin be ADDED a role — only removal is guarded', () => {
    const plan = planBulkRoleEdit({
      userIds: ['me'],
      assignments: [],
      add: ['steward'],
      remove: [],
      clubIds: [],
      currentUserId: 'me',
    });
    expect(plan.people).toEqual([
      { userId: 'me', remove: [], add: [{ role: 'steward', clubId: null }] },
    ]);
  });
});

describe('plansEqual', () => {
  const base = () =>
    planBulkRoleEdit({
      userIds: ['sam'],
      assignments: [assignment('s-judge', 'sam', 'judge')],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });

  it('is order-independent for people, removals and adds', () => {
    const a = planBulkRoleEdit({
      userIds: ['sam', 'bob'],
      assignments: [assignment('s-judge', 'sam', 'judge'), assignment('b-judge', 'bob', 'judge')],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    const b = planBulkRoleEdit({
      userIds: ['bob', 'sam'],
      assignments: [assignment('b-judge', 'bob', 'judge'), assignment('s-judge', 'sam', 'judge')],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    expect(plansEqual(a, b)).toBe(true);
  });

  // MYK9-820 round-3 finding #1: the assignment id a stale plan would revoke no
  // longer exists once someone else already revoked it — the fresh plan must
  // read as a DIFFERENT plan, not the same one under a new id.
  it('detects that the roster moved: an assignment id was already revoked', () => {
    const stale = base();
    const fresh = planBulkRoleEdit({
      userIds: ['sam'],
      assignments: [], // sam's judge grant is already gone
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    expect(plansEqual(stale, fresh)).toBe(false);
  });

  it('detects a role change that adds a new person to the plan', () => {
    const stale = base();
    const fresh = planBulkRoleEdit({
      userIds: ['sam', 'bob'],
      assignments: [assignment('s-judge', 'sam', 'judge'), assignment('b-judge', 'bob', 'judge')],
      add: [],
      remove: ['judge'],
      clubIds: [],
    });
    expect(plansEqual(stale, fresh)).toBe(false);
  });
});

describe('summary and runner agree', () => {
  it('the runner revokes exactly the (person, assignment) pairs the plan lists', async () => {
    const assignments = [
      assignment('a-judge', 'alice', 'judge'),
      assignment('a-judge-show', 'alice', 'judge', { showId: 'show-1' }),
      assignment('b-sec-c1', 'bob', 'secretary', { clubId: 'c1' }),
      assignment('b-sec-c2', 'bob', 'secretary', { clubId: 'c2' }),
      assignment('c-sec-none', 'cara', 'secretary'),
      assignment('d-steward', 'dev', 'steward', { expiresAt: '2027-01-01' }),
      assignment('d-judge', 'dev', 'judge'),
    ];
    const plan = planBulkRoleEdit({
      userIds: ['alice', 'bob', 'cara', 'dev'],
      assignments,
      add: ['steward'],
      remove: ['judge', 'secretary'],
      clubIds: ['c1'],
    });

    for (const person of plan.people) {
      await executePersonPlan(person);
    }

    const revoked = new Set(
      revokeUserRole.mock.calls.map(([id]) => {
        const a = assignments.find(x => x.id === id);
        return `${a?.userId}:${id}`;
      })
    );
    expect(revoked).toEqual(plannedRemovals(plan));
    expect(revoked).toEqual(new Set(['alice:a-judge', 'bob:b-sec-c1', 'dev:d-judge']));

    const granted = ensureUserHasRole.mock.calls.map(([userId, role]) => `${userId}:${role}`);
    expect(granted).toEqual(plan.people.flatMap(p => p.add.map(g => `${p.userId}:${g.role}`)));
  });
});
