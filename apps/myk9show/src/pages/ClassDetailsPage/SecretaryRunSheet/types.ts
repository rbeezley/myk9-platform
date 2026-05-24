import type { CheckInStatus } from '@myk9/core';

export type ClassPhase = 'not-started' | 'in-progress' | 'finished';

export interface RunSheetResult {
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
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  const h = Math.floor((secs % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(h).padStart(2, '0')}`;
}

/** Derive ClassPhase from the string stored in ClassData.status. */
export function toClassPhase(status: string | undefined): ClassPhase {
  if (status === 'In Progress') return 'in-progress';
  if (status === 'Completed' || status === 'Cancelled') return 'finished';
  return 'not-started';
}
