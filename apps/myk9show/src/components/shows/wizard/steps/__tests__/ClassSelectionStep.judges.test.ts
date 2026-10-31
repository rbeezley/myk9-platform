import { describe, it, expect } from 'vitest';
import type { User } from '@/types/user-types';
import { judgeIdsQualifiedForShow } from '../ClassSelectionStep.helpers';

function person(id: string, org: string, status = 'Active'): User {
  return {
    id,
    judgeInfo: { judgeNumber: '1', qualifications: [{ organization: org, status }] },
  } as unknown as User;
}

describe('judgeIdsQualifiedForShow (MYK9-1580)', () => {
  const people = [
    person('ukc', 'UKC'),
    person('akc', 'AKC'),
    person('lapsed', 'UKC', 'Expired'),
    { id: 'plain' } as User,
  ];

  it('offers only judges with an active qualification for the show registry', () => {
    expect(
      judgeIdsQualifiedForShow(['akc', 'ukc', 'lapsed', 'plain', 'missing'], people, 'UKC')
    ).toEqual(['ukc']);
  });

  it('offers nobody when the organization is unknown', () => {
    expect(judgeIdsQualifiedForShow(['ukc'], people, '')).toEqual([]);
  });
});
