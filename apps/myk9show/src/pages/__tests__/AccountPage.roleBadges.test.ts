import { describe, it, expect } from 'vitest';
import { UserRole } from '@/types/auth-types';
import { describeUserRoleBadges } from '../AccountPage.roleBadges';

describe('describeUserRoleBadges', () => {
  it('reads a club-scoped role as "Role: Club name" when the scope resolves', () => {
    const labels = describeUserRoleBadges(
      [UserRole.SECRETARY, UserRole.EXHIBITOR],
      [
        {
          role: { name: 'secretary' },
          scope_type: 'club',
          scope_id: 'club-1',
          is_active: true,
        },
      ],
      new Map([['club-1', 'WALK TEST Club']])
    );

    expect(labels).toEqual(['Secretary: WALK TEST Club', 'Exhibitor']);
  });

  it('lists one label per distinct club when the same role is granted at more than one club', () => {
    const labels = describeUserRoleBadges(
      [UserRole.CLUB_ADMIN],
      [
        { role: { name: 'club_admin' }, scope_type: 'club', scope_id: 'club-1', is_active: true },
        { role: { name: 'club_admin' }, scope_type: 'club', scope_id: 'club-2', is_active: true },
      ],
      new Map([
        ['club-1', 'Alpha Club'],
        ['club-2', 'Beta Club'],
      ])
    );

    expect(labels).toEqual(['Club Admin: Alpha Club', 'Club Admin: Beta Club']);
  });

  it('falls back to the bare role label when no matching club scope is known yet', () => {
    const labels = describeUserRoleBadges([UserRole.SECRETARY], [], new Map());

    expect(labels).toEqual(['Secretary']);
  });

  it('ignores an inactive scope entry and falls back to the bare label', () => {
    const labels = describeUserRoleBadges(
      [UserRole.SECRETARY],
      [{ role: { name: 'secretary' }, scope_type: 'club', scope_id: 'club-1', is_active: false }],
      new Map([['club-1', 'WALK TEST Club']])
    );

    expect(labels).toEqual(['Secretary']);
  });

  it('does not scope a non-club-scoped role even when a matching entry exists', () => {
    const labels = describeUserRoleBadges(
      [UserRole.JUDGE],
      [{ role: { name: 'judge' }, scope_type: 'club', scope_id: 'club-1', is_active: true }],
      new Map([['club-1', 'WALK TEST Club']])
    );

    expect(labels).toEqual(['Judge']);
  });

  it('preserves the role-hierarchy order across mixed scoped and unscoped roles', () => {
    const labels = describeUserRoleBadges(
      [UserRole.SECRETARY, UserRole.STEWARD, UserRole.EXHIBITOR],
      [],
      new Map()
    );

    expect(labels).toEqual(['Secretary', 'Steward', 'Exhibitor']);
  });

  it('returns an empty list when the user has no active roles', () => {
    expect(describeUserRoleBadges([], [], new Map())).toEqual([]);
  });
});
