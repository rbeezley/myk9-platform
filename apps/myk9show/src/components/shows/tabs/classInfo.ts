import { formatTrialLabel, type ClassStatusValue } from '@myk9/core';
import { formatEntryDate } from '@/lib/format/dates';

export interface ClassInfo {
  id: string;
  name: string;
  element: string;
  level: string;
  section: string;
  judgeName: string;
  /** The assigned judge's person id; absent on the public read, which cannot assign. */
  judgeId?: string;
  trialId: string;
  time: string;
  ring: number;
  status: ClassStatusValue;
  entryCount: number | null;
  scoredCount?: number;
  isScoringFinalized?: boolean;
  hasActiveEntries?: boolean;
  userHasEntry: boolean;
  trialDate?: string;
  trialNumber?: string;
  trialName?: string;
  /** Run-order position (`classes.class_order`); absent on the public read. */
  classOrder?: number;
}

function formatTrialDate(dateStr: string): string {
  // Long weekday style ("Saturday, August 1, 2026") via the shared date module
  // (UX walk remediation 2.A); falls back to the raw string if unparseable.
  return formatEntryDate(dateStr, { style: 'long' }) || dateStr;
}

/** The class's trial label (MYK9-704), or '' when the class carries no trial at all. */
function classTrialPart(cls: ClassInfo): string {
  if (!cls.trialName && !cls.trialNumber) return '';
  return formatTrialLabel({ name: cls.trialName, trialNumber: cls.trialNumber });
}

/** "Saturday, August 1, 2026 — Trial 1": the trial a class belongs to, '' when it has none. */
export function classTrialLabel(cls: ClassInfo): string {
  return [cls.trialDate ? formatTrialDate(cls.trialDate) : '', classTrialPart(cls)]
    .filter(Boolean)
    .join(' — ');
}
