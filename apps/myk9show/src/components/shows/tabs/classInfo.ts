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

interface TrialLabelParts {
  trialDate?: string | undefined;
  trialNumber?: string | undefined;
  trialName?: string | undefined;
}

/** "Saturday, August 1, 2026 — Trial 1" from a trial's parts (MYK9-704), '' when it has none. */
export function trialLabelFor(parts: TrialLabelParts): string {
  const trialPart =
    !parts.trialName && !parts.trialNumber
      ? ''
      : formatTrialLabel({ name: parts.trialName, trialNumber: parts.trialNumber });
  return [parts.trialDate ? formatTrialDate(parts.trialDate) : '', trialPart]
    .filter(Boolean)
    .join(' — ');
}

/** The trial a class belongs to, '' when it has none. */
export function classTrialLabel(cls: ClassInfo): string {
  return trialLabelFor(cls);
}
