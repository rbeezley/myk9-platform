import { describe, expect, it } from 'vitest';
import { resolveSelectedJudges } from '../ShowDetailsStep.helpers';
import type { User } from '@/types/user-types';

const judge = {
  id: 'j1',
  firstName: 'Dana',
  lastName: 'Judge',
  judgeInfo: {
    judgeNumber: 'AKC-SW-1002',
    qualifications: [
      { judgeNumber: 'AKC-SW-1002', organization: 'AKC' },
      { judgeNumber: 'UKC-77', organization: 'UKC' },
    ],
  },
} as unknown as User;
const akcOnly = {
  ...judge,
  id: 'j2',
  judgeInfo: {
    judgeNumber: 'AKC-SW-1002',
    qualifications: [{ judgeNumber: 'AKC-SW-1002', organization: 'AKC' }],
  },
} as unknown as User;

describe('resolveSelectedJudges (MYK9-832)', () => {
  it('uses the number issued by the show registry', () => {
    const [resolved] = resolveSelectedJudges(['j1'], [judge], {}, 'UKC');
    expect(resolved).toMatchObject({ judgeNumber: 'UKC-77', organization: 'UKC' });
  });

  it('gives no number when the judge has no qualification from the show registry', () => {
    const [resolved] = resolveSelectedJudges(['j2'], [akcOnly], {}, 'UKC');
    expect(resolved?.judgeNumber).toBe('');
    expect(resolved?.organization).toBeUndefined();
  });

  it('keeps the person-level number when the show has no configured registry', () => {
    const [resolved] = resolveSelectedJudges(['j1'], [judge], {});
    expect(resolved).toMatchObject({ judgeNumber: 'AKC-SW-1002' });
  });
});
