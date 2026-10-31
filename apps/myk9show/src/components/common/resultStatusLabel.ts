/** Known result status values from the scoring system */
export type ResultStatus = 'qualified' | 'nq' | 'absent' | 'excused' | 'disqualified' | 'withdrawn';

/** Map from raw result_status to abbreviated label */
const STATUS_LABELS: Record<ResultStatus, string> = {
  qualified: 'Q',
  nq: 'NQ',
  absent: 'ABS',
  excused: 'EX',
  disqualified: 'DQ',
  withdrawn: 'WD',
};

/** The abbreviation shown for a raw result_status (Q, NQ, ABS, EX, DQ, WD). */
export function resultStatusLabel(resultStatus: string): string {
  return STATUS_LABELS[resultStatus as ResultStatus] ?? resultStatus.toUpperCase();
}
