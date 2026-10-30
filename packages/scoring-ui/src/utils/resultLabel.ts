/**
 * The words a judge reads for a result code, on every scoresheet, chip and
 * confirmation (MYK9-1501). One table so no sport shows "Q" or "EX" where
 * another shows "Qualified" or "Excused".
 */
const RESULT_LABELS: Record<string, string> = {
  Q: 'Qualified',
  NQ: 'NQ',
  ABS: 'Absent',
  EX: 'Excused',
  DQ: 'DQ',
};

/** "Qualified", "NQ", "Absent", "Excused" or "DQ"; anything else (a placement) is returned as is. */
export function resultLabel(code: string | null | undefined): string {
  if (!code) return '';
  return RESULT_LABELS[code] ?? code;
}
