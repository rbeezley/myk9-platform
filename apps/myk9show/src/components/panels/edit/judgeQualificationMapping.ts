import type {
  JudgeQualification as DbJudgeQualification,
  CreateJudgeQualificationData,
} from '@/types/judge-management';
import type { JudgeQualification } from '@/types/user-types';
import { toLocalDate } from '@/utils/date-format';
import { toYYYYMMDD } from '@myk9/core';

export function mapDbToUiQualification(q: DbJudgeQualification): JudgeQualification {
  return {
    id: q.id,
    judgeNumber: q.judge_number || '',
    organization: q.organization,
    level: q.qualification_level || '',
    showTypes: q.disciplines || [],
    disciplines: q.disciplines || [],
    certificationDate: q.date_obtained || '',
    dateObtained: q.date_obtained ? toLocalDate(q.date_obtained) : null,
    expirationDate: q.expiration_date ? toLocalDate(q.expiration_date) : null,
    status: q.is_active ? 'Active' : q.suspension_date ? 'Suspended' : 'Expired',
  } as JudgeQualification;
}

export function mapUiToDbQualification(
  qual: JudgeQualification,
  personId: string
): CreateJudgeQualificationData {
  return {
    ...(qual.id ? { id: qual.id } : {}),
    person_id: personId,
    organization: qual.organization,
    qualification_level: qual.level || '',
    disciplines: qual.showTypes || qual.disciplines || [],
    ...(qual.judgeNumber ? { judge_number: qual.judgeNumber } : {}),
    // MYK9-2393: an existing credential with no date keeps null; only a new row gets today.
    date_obtained:
      qual.certificationDate ||
      (qual.dateObtained ? toYYYYMMDD(qual.dateObtained) : qual.id ? null : toYYYYMMDD(new Date())),
    ...(qual.expirationDate ? { expiration_date: toYYYYMMDD(qual.expirationDate) } : {}),
    is_active: qual.status === 'Active',
  };
}
