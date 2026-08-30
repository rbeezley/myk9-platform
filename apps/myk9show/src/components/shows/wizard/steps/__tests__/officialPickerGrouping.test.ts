/**
 * F8 — the Show Chairman picker offered one flat "All People" list: other clubs'
 * secretaries, exhibitors and admins, with nothing to say which of them the host club
 * actually knows.
 *
 * Members are surfaced, NOT enforced. A club may legitimately appoint a chairman from
 * outside its roster, so the fix is grouping — the same shape JudgesPicker uses, which
 * the audit cites as doing this better.
 */
import { describe, expect, it } from 'vitest';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';
import { groupPeopleForOfficial } from '../ShowDetailsStep.helpers';

function person(id: string, lastName: string, roles: string[] = []): User {
  return { id, firstName: 'Test', lastName, roles } as unknown as User;
}

const memberChair = person('m1', 'Able', [UserRole.CHAIRMAN]);
const memberPlain = person('m2', 'Baker');
const outsiderChair = person('o1', 'Carter', [UserRole.CHAIRMAN]);
const outsiderPlain = person('o2', 'Dodd');

const ALL = [outsiderPlain, memberPlain, outsiderChair, memberChair];
const SUGGESTED = [UserRole.CHAIRMAN, UserRole.CLUB_ADMIN];

describe('groupPeopleForOfficial with a club roster', () => {
  it('lifts club members into their own group', () => {
    const { members, suggested, others } = groupPeopleForOfficial(
      ALL,
      SUGGESTED,
      '',
      [],
      ['m1', 'm2']
    );

    expect(members.map(p => p.id).sort()).toEqual(['m1', 'm2']);
    expect(suggested.map(p => p.id)).toEqual(['o1']);
    expect(others.map(p => p.id)).toEqual(['o2']);
  });

  it('puts a member in members even when they also hold a suggested role', () => {
    // Club membership outranks the platform-wide role hint: for a club's own show,
    // "someone this club knows" is the more useful first cut. A person appearing in
    // two groups would read as a duplicate.
    const { members, suggested } = groupPeopleForOfficial(ALL, SUGGESTED, '', [], ['m1']);

    expect(members.map(p => p.id)).toEqual(['m1']);
    expect(suggested.map(p => p.id)).not.toContain('m1');
  });

  it('still offers non-members, so a cross-club chairman stays reachable', () => {
    // The finding is about ORDERING, not access. Hiding outsiders would break a
    // legitimate appointment and was explicitly not the decision taken.
    const { suggested, others } = groupPeopleForOfficial(ALL, SUGGESTED, '', [], ['m1', 'm2']);

    expect([...suggested, ...others].map(p => p.id).sort()).toEqual(['o1', 'o2']);
  });

  it('behaves exactly as before when no roster is supplied', () => {
    // Callers with no club context must be unaffected.
    const { members, suggested, others } = groupPeopleForOfficial(ALL, SUGGESTED, '');

    expect(members).toEqual([]);
    expect(suggested.map(p => p.id).sort()).toEqual(['m1', 'o1']);
    expect(others.map(p => p.id).sort()).toEqual(['m2', 'o2']);
  });

  it('applies the search term across every group', () => {
    const { members, suggested, others } = groupPeopleForOfficial(
      ALL,
      SUGGESTED,
      'able',
      [],
      ['m1', 'm2']
    );

    expect(members.map(p => p.id)).toEqual(['m1']);
    expect(suggested).toEqual([]);
    expect(others).toEqual([]);
  });

  it('still honours excludePersonIds, including for members', () => {
    // A chairman and secretary cannot be the same person; membership must not
    // resurrect someone already taken.
    const { members } = groupPeopleForOfficial(ALL, SUGGESTED, '', ['m1'], ['m1', 'm2']);

    expect(members.map(p => p.id)).toEqual(['m2']);
  });
});
