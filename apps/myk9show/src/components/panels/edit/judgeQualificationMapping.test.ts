import { describe, it, expect, afterEach } from 'vitest';
import { mapDbToUiQualification, mapUiToDbQualification } from './judgeQualificationMapping';
import type { JudgeQualification as DbJudgeQualification } from '@/types/judge-management';

const originalTz = process.env.TZ;

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('judge qualification date round trip', () => {
  it('keeps the expiration day when the host is west of UTC', () => {
    process.env.TZ = 'America/Los_Angeles';
    const db = {
      organization: 'AKC',
      is_active: true,
      date_obtained: '2020-01-02',
      expiration_date: '2027-03-15',
    } as DbJudgeQualification;

    const saved = mapUiToDbQualification(mapDbToUiQualification(db), 'person-1');

    expect(saved.expiration_date).toBe('2027-03-15');
    expect(saved.date_obtained).toBe('2020-01-02');
  });
});
