/** A single entry shaped for print reports */
export interface PrintReportEntry {
  id: string;
  armband: number;
  runOrder: number | null;
  callName: string;
  breed: string;
  handlerName: string;
  isScored: boolean;
  resultText: string | null; // 'Q' | 'NQ' | 'Absent' | 'Excused' | 'Withdrawn'
  placement: number | null; // 1-N for qualified; 9996+ sentinel codes
  searchTimeSeconds: number | null;
  faultCount: number | null;
}

/** Class metadata shaped for print headers */
export interface PrintClassInfo {
  className: string;
  element: string | null;
  level: string | null;
  section: string | null;
  judgeName: string | null;
  trialDate: string; // ISO date string
  trialNumber: string;
  showName: string;
  timeLimitSeconds: number | null;
  areaCount: number | null;
}
