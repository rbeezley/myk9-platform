import { describe, expect, it } from 'vitest';
import { mapDbUserToUser } from '../useUsersQuery';
import { isJudgePerson } from '@/components/panels/edit/UserEditPanel.helpers';

/**
 * MYK9-2292: a judge the show wizard creates has a judge qualification and no RBAC judge role.
 * The People roster maps the database row it reads (`getAllUsers` joins judge_qualifications),
 * so the joined qualification must survive the mapping or the profile hides the affiliation.
 */
const row = (judgeQualifications: unknown) =>
  ({
    id: 'p1',
    first_name: 'Kim',
    last_name: 'Lee',
    judge_affiliation: null,
    status: 'active',
    judge_qualifications: judgeQualifications,
  }) as unknown as Parameters<typeof mapDbUserToUser>[0];

describe('mapDbUserToUser judge qualifications (MYK9-2292)', () => {
  it('keeps a joined qualification, so a qualification-only judge is a judge', () => {
    const person = mapDbUserToUser(
      row([
        {
          id: 'q1',
          organization: 'AKC',
          qualification_level: 'Regular',
          disciplines: ['Scent Work'],
          judge_number: '123',
          date_obtained: '2025-01-01',
          expiration_date: null,
          is_active: true,
        },
      ])
    );
    expect(person.judgeQualifications).toHaveLength(1);
    expect(person.judgeQualifications?.[0]).toMatchObject({
      organization: 'AKC',
      status: 'Active',
    });
    expect(isJudgePerson(person)).toBe(true);
  });

  it('maps a row with no qualifications join to an empty list', () => {
    const person = mapDbUserToUser(row(undefined));
    expect(person.judgeQualifications).toEqual([]);
    expect(isJudgePerson(person)).toBe(false);
  });
});
