import type { CheckInStatus } from '@myk9/core';
import { formatSecondsAsMSSCC } from '@/lib/format/searchTime';

export type ClassPhase = 'not-started' | 'in-progress' | 'finished';

/** entries.result_status values a scored run can carry (see manual-result-types). */
export type RunOutcome = 'qualified' | 'nq' | 'absent' | 'excused' | 'disqualified' | 'withdrawn';

export interface RunSheetResult {
  outcome: RunOutcome;
  qualified: boolean;
  timeStr: string;
  faults: number;
  placement: number | null;
  judgeNotes: string;
}

export interface RunSheetEntry {
  id: string;
  runOrder: number;
  dogName: string;
  armband: string;
  breed: string | null;
  handlerName: string;
  ownerName: string;
  checkInStatus: CheckInStatus;
  isCheckedIn: boolean;
  isScratched: boolean;
  isScored: boolean;
  result: RunSheetResult | null;
}

/** Format decimal seconds → "M:SS.HH" for display in result badges. */
export function formatSearchTime(secs: number): string {
  return formatSecondsAsMSSCC(secs);
}

/** Derive ClassPhase from the string stored in ClassData.status. */
export function toClassPhase(status: string | undefined): ClassPhase {
  if (status === 'In Progress') return 'in-progress';
  if (status === 'Completed' || status === 'Cancelled') return 'finished';
  return 'not-started';
}
