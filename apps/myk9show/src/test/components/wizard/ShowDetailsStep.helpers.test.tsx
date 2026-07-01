import { describe, it, expect } from 'vitest';
import {
  groupPeopleForOfficial,
  groupPeopleForJudges,
} from '@/components/shows/wizard/steps/ShowDetailsStep.helpers';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

function makeUser(overrides: Partial<User> & { id: string }): User {
  return {
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    roles: [],
    judgeInfo: undefined,
    ...overrides,
  } as User;
}

describe('groupPeopleForOfficial', () => {
  const chairman = makeUser({ id: '1', firstName: 'Alice', roles: [UserRole.CHAIRMAN] });
  const secretary = makeUser({ id: '2', firstName: 'Bob', roles: [UserRole.SECRETARY] });
  const exhibitor = makeUser({ id: '3', firstName: 'Carol', roles: [UserRole.EXHIBITOR] });

  it('puts role-holders in suggested, everyone else in others', () => {
    const result = groupPeopleForOfficial(
      [chairman, secretary, exhibitor],
      [UserRole.CHAIRMAN],
      ''
    );
    expect(result.suggested).toEqual([chairman]);
    expect(result.others).toContain(secretary);
    expect(result.others).toContain(exhibitor);
  });

  it('filters by search term across both groups', () => {
    const result = groupPeopleForOfficial(
      [chairman, secretary, exhibitor],
      [UserRole.CHAIRMAN],
      'ali'
    );
    expect(result.suggested).toHaveLength(1);
    expect(result.others).toHaveLength(0);
  });

  it('returns all in others when no suggested roles match', () => {
    const result = groupPeopleForOfficial([exhibitor], [UserRole.CHAIRMAN], '');
    expect(result.suggested).toHaveLength(0);
    expect(result.others).toHaveLength(1);
  });

  it('excludes the given ids from both groups (chairman ≠ secretary)', () => {
    // Secretary is excluded from the Chairman picker: a person cannot be both.
    const result = groupPeopleForOfficial(
      [chairman, secretary, exhibitor],
      [UserRole.CHAIRMAN],
      '',
      [secretary.id]
    );
    expect(result.suggested).toEqual([chairman]);
    expect(result.others).toContain(exhibitor);
    expect(result.others).not.toContain(secretary);
    expect([...result.suggested, ...result.others]).not.toContain(secretary);
  });

  it('excludes a role-holder from the suggested group when its id is excluded', () => {
    const result = groupPeopleForOfficial(
      [chairman, exhibitor],
      [UserRole.CHAIRMAN],
      '',
      [chairman.id]
    );
    expect(result.suggested).toHaveLength(0);
    expect(result.others).toEqual([exhibitor]);
  });

  it('is a no-op when excluding an id that is not present', () => {
    const result = groupPeopleForOfficial(
      [chairman, secretary, exhibitor],
      [UserRole.CHAIRMAN],
      '',
      ['does-not-exist']
    );
    expect(result.suggested).toEqual([chairman]);
    expect(result.others).toHaveLength(2);
  });

  it('defaults to no exclusions when the arg is omitted', () => {
    const result = groupPeopleForOfficial([chairman, secretary, exhibitor], [UserRole.CHAIRMAN], '');
    expect([...result.suggested, ...result.others]).toHaveLength(3);
  });
});

describe('groupPeopleForJudges', () => {
  const qualified = makeUser({
    id: '1',
    firstName: 'Alice',
    judgeInfo: {
      judgeNumber: 'AKC-1',
      qualifications: [{ judgeNumber: 'AKC-1', organization: 'AKC' } as never],
      certifications: [],
      availability: {
        startDate: null,
        endDate: null,
        blackoutDates: [],
        maxShowsPerMonth: 0,
        travelRadius: 0,
      },
    },
  });
  const unqualified = makeUser({ id: '2', firstName: 'Bob' });
  const alreadySelected = makeUser({ id: '3', firstName: 'Carol' });

  it('puts people with judgeInfo in qualified group', () => {
    const result = groupPeopleForJudges([qualified, unqualified], [], '');
    expect(result.qualified).toEqual([qualified]);
    expect(result.others).toEqual([unqualified]);
  });

  it('excludes already-selected judges from both groups', () => {
    const result = groupPeopleForJudges([qualified, unqualified, alreadySelected], ['3'], '');
    expect(result.qualified).not.toContain(alreadySelected);
    expect(result.others).not.toContain(alreadySelected);
  });

  it('filters by name search term', () => {
    const result = groupPeopleForJudges([qualified, unqualified], [], 'ali');
    expect(result.qualified).toHaveLength(1);
    expect(result.others).toHaveLength(0);
  });
});
