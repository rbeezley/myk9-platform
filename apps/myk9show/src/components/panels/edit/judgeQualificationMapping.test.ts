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

describe('judge qualification id and null-date round trip (MYK9-2393)', () => {
  const suspended = {
    id: 'q-1',
    person_id: 'person-1',
    organization: 'AKC',
    qualification_level: 'Master',
    disciplines: ['Scent Work'],
    is_active: false,
    date_obtained: null,
    suspension_date: '2026-01-05',
    suspension_reason: 'Dues',
  } as unknown as DbJudgeQualification;

  it('carries the row id and keeps a suspended status unchanged', () => {
    const saved = mapUiToDbQualification(mapDbToUiQualification(suspended), 'person-1');

    expect(saved.id).toBe('q-1');
    expect(saved.is_active).toBe(false);
  });

  it('keeps a null date_obtained null for an existing credential', () => {
    const saved = mapUiToDbQualification(mapDbToUiQualification(suspended), 'person-1');

    expect(saved.date_obtained).toBeNull();
  });

  it('still defaults date_obtained to today for a new qualification', () => {
    const saved = mapUiToDbQualification(
      {
        organization: 'UKC',
        level: '',
        disciplines: [],
        showTypes: [],
        judgeNumber: '',
        certificationDate: '',
        dateObtained: null,
        expirationDate: null,
        status: 'Active',
      },
      'person-1'
    );

    expect(saved.id).toBeUndefined();
    expect(saved.date_obtained).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('saves null when the secretary clears the date on an existing row', () => {
    const ui = mapDbToUiQualification({
      ...suspended,
      date_obtained: '2020-01-02',
    } as DbJudgeQualification);

    const saved = mapUiToDbQualification({ ...ui, certificationDate: '' }, 'person-1');

    expect(saved.date_obtained).toBeNull();
  });

  it('sends the form status so the server can reconcile suspension data', () => {
    const ui = mapDbToUiQualification(suspended);

    expect(mapUiToDbQualification(ui, 'person-1').status).toBe('Suspended');
    expect(mapUiToDbQualification({ ...ui, status: 'Expired' }, 'person-1').status).toBe('Expired');
  });
});
