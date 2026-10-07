import { judgeSignOffWording } from './judgeSignOff';
import {
  CLASS_STATUS,
  isCheckInStatus,
  normalizeClassStatus,
  type TrialStatusKey,
} from '@myk9/core';
import { getStatusDescriptor } from '@/components/status';
import type {
  ShowMapClassInput,
  ShowMapDisplayStatus,
  ShowMapEntryInput,
  ShowMapProgress,
} from './showMapTypes';
import { SHOW_MAP_WRAP_UP_STATUS } from './showMapTypes';

const COMPLETE_RESULT_STATUSES = new Set([
  'qualified',
  'nq',
  'non_qualifying',
  'absent',
  'excused',
]);
const SCRATCH_ENTRY_STATUSES = new Set([
  'scratch',
  'scratched',
  'withdrawn',
  'cancelled',
  'canceled',
]);

function readString(record: ShowMapEntryInput, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readBoolean(record: ShowMapEntryInput, key: string): boolean {
  return record[key] === true;
}

interface ClassWrapUpStatusOptions {
  resultSubmittedAt?: string | null | undefined;
  /** The class's trial registry; selects initials (AKC) or signature wording. */
  registryId?: string | null | undefined;
  /**
   * MYK9-1030: the class's judge still has a class to run that day. The judge signs off once,
   * at the end of their day, so until then a complete class waits without nagging.
   */
  judgeDayOpen?: boolean | undefined;
}

function isEntryPulledOrScratched(entry: ShowMapEntryInput): boolean {
  const entryStatus = readString(entry, 'entry_status')?.toLowerCase();
  const checkInStatus = readString(entry, 'check_in_status')?.toLowerCase();
  return Boolean(
    (entryStatus && SCRATCH_ENTRY_STATUSES.has(entryStatus)) || checkInStatus === 'pulled'
  );
}

export function classifyClassStatus(status?: string): ShowMapDisplayStatus | undefined {
  if (!status) return undefined;
  const normalized = normalizeClassStatus(status);
  const label = getStatusDescriptor('class', normalized).label;

  if (normalized === CLASS_STATUS.COMPLETED) {
    return { value: normalized, label, kind: 'complete' };
  }
  if (normalized === CLASS_STATUS.IN_PROGRESS) {
    return { value: normalized, label, kind: 'active' };
  }
  if (normalized === CLASS_STATUS.CANCELLED) {
    return { value: normalized, label, kind: 'muted' };
  }
  return { value: normalized, label: 'Not started', kind: 'neutral' };
}

export function classifyTrialStatus(status: TrialStatusKey): ShowMapDisplayStatus {
  const label = getStatusDescriptor('trial', status).label;
  const kind =
    status === 'completed'
      ? 'complete'
      : status === 'in-progress'
        ? 'active'
        : status === 'cancelled'
          ? 'muted'
          : 'neutral';
  return { value: status, label, kind };
}

/**
 * Whether a class has finished running: its status says so, or every entry is accounted for.
 * The one completeness rule the wrap-up status and the judge's day (MYK9-1030) share.
 */
export function isClassRunComplete(cls: ShowMapClassInput, entries: ShowMapEntryInput[]): boolean {
  if (classifyClassStatus(cls.status)?.kind === 'complete') return true;
  const progress = buildClassProgress(cls, entries);
  return progress ? progress.completed >= progress.total && progress.total > 0 : false;
}

/**
 * MYK9-1030: true only when the class is KNOWN to have nothing left to run: the caller's entries
 * read produced data (the Show Desk passes `entryCount` as a number only then, `null` otherwise)
 * and no entry is expected to run or waiting on acceptance. An unknown count is never "empty".
 * Such a class is never completed by the server, so it must not hold its judge's day open.
 */
export function isClassConfirmedEmpty(cls: ShowMapClassInput): boolean {
  if (typeof cls.entryCount !== 'number' || cls.entryCount !== 0) return false;
  return cls.runListCount === undefined || cls.runListCount === 0;
}

export function classifyClassWrapUpStatus(
  cls: ShowMapClassInput,
  entries: ShowMapEntryInput[],
  options: ClassWrapUpStatusOptions = {}
): ShowMapDisplayStatus | undefined {
  if (!isClassRunComplete(cls, entries)) return undefined;

  if (options.resultSubmittedAt) {
    return {
      value: SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY,
      label: 'Submitted to registry',
      kind: 'complete',
    };
  }

  // Every entry pulled or scratched: nothing for the judge to sign.
  if (!entries.some(entry => !isEntryPulledOrScratched(entry))) {
    return {
      value: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
      label: 'Ready for wrap-up',
      kind: 'neutral',
    };
  }

  // MYK9-1030: the sign-off lives on the class (classes.judge_signed_off_at), recorded for the
  // judge's whole day at once. entries.judge_signature has no writer, so it is not read.
  const wording = judgeSignOffWording(options.registryId);
  if (cls.judgeSignedOffAt) {
    return {
      value: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
      label: wording.doneStatusLabel,
      kind: 'neutral',
    };
  }
  if (options.judgeDayOpen) {
    return {
      value: SHOW_MAP_WRAP_UP_STATUS.JUDGE_SIGN_OFF_AT_END_OF_DAY,
      label: wording.endOfDayStatusLabel,
      kind: 'neutral',
    };
  }
  return {
    value: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
    label: wording.needsStatusLabel,
    kind: 'attention',
  };
}

export function classifyEntryRunStatus(entry: ShowMapEntryInput): ShowMapDisplayStatus | undefined {
  const entryStatus = readString(entry, 'entry_status')?.toLowerCase();
  const resultStatus = readString(entry, 'result_status')?.toLowerCase();
  const checkInStatus = readString(entry, 'check_in_status')?.toLowerCase();

  // A 'moved' entry is the RETIRED source record left behind when an entry is
  // promoted to a higher class — it still carries the OLD class_id, so
  // without this it rendered in its old class's run order as an ordinary
  // pending entry and offered "Move up" a second time (MYK9-825).
  if (entryStatus === 'moved') {
    return { value: 'moved', label: 'Moved', kind: 'muted' };
  }

  if (isEntryPulledOrScratched(entry)) {
    return { value: entryStatus ?? 'pulled', label: 'Pulled', kind: 'muted' };
  }

  if (
    readBoolean(entry, 'is_scored') ||
    readString(entry, 'scoring_completed_at') ||
    (resultStatus && COMPLETE_RESULT_STATUSES.has(resultStatus)) ||
    checkInStatus === 'completed'
  ) {
    return { value: resultStatus ?? 'complete', label: 'Complete', kind: 'complete' };
  }

  if (checkInStatus === 'in-ring' || readString(entry, 'ring_entry_time')) {
    return { value: 'in-ring', label: 'In ring', kind: 'active' };
  }

  if (
    entryStatus &&
    ['accepted', 'confirmed', 'submitted', 'pending', 'draft'].includes(entryStatus)
  ) {
    return { value: entryStatus, label: 'Pending', kind: 'neutral' };
  }

  return undefined;
}

export function classifyEntryCheckInStatus(
  entry: ShowMapEntryInput
): ShowMapDisplayStatus | undefined {
  const status = readString(entry, 'check_in_status');
  if (!status || !isCheckInStatus(status)) return undefined;

  if (status === 'no-status') {
    return { value: status, label: 'Not checked in', kind: 'neutral' };
  }
  if (status === 'come-to-gate') {
    return { value: status, label: 'Called to gate', kind: 'active' };
  }
  if (status === 'at-gate') {
    return { value: status, label: 'At gate', kind: 'active' };
  }
  if (status === 'conflict') {
    return { value: status, label: 'Conflict', kind: 'neutral' };
  }
  if (status === 'pulled') {
    return { value: status, label: 'Pulled', kind: 'muted' };
  }
  if (status === 'completed') {
    return { value: status, label: 'Complete', kind: 'complete' };
  }

  return {
    value: status,
    label: status === 'checked-in' ? 'Checked in' : getStatusDescriptor('entry', status).label,
    kind: status === 'in-ring' ? 'active' : 'complete',
  };
}

export function isEntryComplete(entry: ShowMapEntryInput): boolean {
  const runStatus = classifyEntryRunStatus(entry);
  return runStatus?.kind === 'complete' || isEntryPulledOrScratched(entry);
}

export function buildProgress(
  completed: number,
  total: number,
  unit: string
): ShowMapProgress | undefined {
  if (total <= 0) return undefined;
  return {
    completed,
    total,
    label: `${completed}/${total} ${unit} complete`,
  };
}

export function buildClassProgress(
  cls: ShowMapClassInput,
  entries: ShowMapEntryInput[]
): ShowMapProgress | undefined {
  if (entries.length > 0) {
    return buildProgress(entries.filter(isEntryComplete).length, entries.length, 'entries');
  }
  if (typeof cls.scoredCount === 'number' && typeof cls.entryCount === 'number') {
    return buildProgress(cls.scoredCount, cls.entryCount, 'entries');
  }
  return undefined;
}
