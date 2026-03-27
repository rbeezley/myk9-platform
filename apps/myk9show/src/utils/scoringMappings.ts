import type { QualificationStatus } from '@/types/scent-work-types';

const RESULT_STATUS_TO_QUALIFICATION: Record<string, QualificationStatus> = {
  qualified: 'Qualified',
  nq: 'Not Qualified',
  absent: 'Absent',
  excused: 'Excused',
  withdrawn: 'Withdrawn',
};

const QUALIFICATION_TO_RESULT_STATUS: Record<string, string> = {
  Qualified: 'qualified',
  'Not Qualified': 'nq',
  Absent: 'absent',
  Excused: 'excused',
  Withdrawn: 'withdrawn',
  Eliminated: 'nq',
};

export function mapResultStatusToQualification(
  resultStatus: string | null | undefined
): QualificationStatus | '' {
  if (!resultStatus || resultStatus === 'pending') return '';
  return RESULT_STATUS_TO_QUALIFICATION[resultStatus] ?? '';
}

export function mapQualificationToResultStatus(qualification: QualificationStatus | ''): string {
  if (!qualification) return 'pending';
  return QUALIFICATION_TO_RESULT_STATUS[qualification] ?? 'pending';
}

export function dbSecondsToInputFormat(seconds: number | null | undefined): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.round((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

export function inputFormatToDbSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
  if (!match) return 0;
  const minutes = parseInt(match[1]);
  const seconds = parseInt(match[2]);
  const hundredths = parseInt(match[3]);
  return minutes * 60 + seconds + hundredths / 100;
}
