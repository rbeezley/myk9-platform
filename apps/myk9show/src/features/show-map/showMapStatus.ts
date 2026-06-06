import {
  CLASS_STATUS,
  getCheckinStatusConfig,
  getClassStatusDisplay,
  isCheckInStatus,
  normalizeClassStatus,
} from '@myk9/core';
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
}

function entryHasJudgeSignature(entry: ShowMapEntryInput): boolean {
  return Boolean(
    readString(entry, 'judge_signature_timestamp') || readString(entry, 'judge_signature')
  );
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
  const display = getClassStatusDisplay(normalized);

  if (normalized === CLASS_STATUS.COMPLETED) {
    return { value: normalized, label: display.label, kind: 'complete' };
  }
  if (normalized === CLASS_STATUS.IN_PROGRESS) {
    return { value: normalized, label: display.label, kind: 'active' };
  }
  if (normalized === CLASS_STATUS.CANCELLED) {
    return { value: normalized, label: display.label, kind: 'muted' };
  }
  return { value: normalized, label: 'Not started', kind: 'neutral' };
}

export function classifyClassWrapUpStatus(
  cls: ShowMapClassInput,
  entries: ShowMapEntryInput[],
  options: ClassWrapUpStatusOptions = {}
): ShowMapDisplayStatus | undefined {
  const baseStatus = classifyClassStatus(cls.status);
  const progress = buildClassProgress(cls, entries);
  const isComplete =
    baseStatus?.kind === 'complete' ||
    (progress ? progress.completed >= progress.total && progress.total > 0 : false);

  if (!isComplete) return undefined;

  if (options.resultSubmittedAt) {
    return {
      value: SHOW_MAP_WRAP_UP_STATUS.SUBMITTED_TO_REGISTRY,
      label: 'Submitted to registry',
      kind: 'complete',
    };
  }

  const entriesRequiringSignature = entries.filter(entry => !isEntryPulledOrScratched(entry));
  if (entriesRequiringSignature.length > 0) {
    if (entriesRequiringSignature.every(entryHasJudgeSignature)) {
      return {
        value: SHOW_MAP_WRAP_UP_STATUS.SIGNED_BY_JUDGE,
        label: 'Signed by judge',
        kind: 'neutral',
      };
    }

    return {
      value: SHOW_MAP_WRAP_UP_STATUS.NEEDS_JUDGE_SIGNATURE,
      label: 'Needs judge signature',
      kind: 'attention',
    };
  }

  return {
    value: SHOW_MAP_WRAP_UP_STATUS.CLASS_READY_FOR_WRAP_UP,
    label: 'Ready for wrap-up',
    kind: 'neutral',
  };
}

export function classifyEntryRunStatus(entry: ShowMapEntryInput): ShowMapDisplayStatus | undefined {
  const entryStatus = readString(entry, 'entry_status')?.toLowerCase();
  const resultStatus = readString(entry, 'result_status')?.toLowerCase();
  const checkInStatus = readString(entry, 'check_in_status')?.toLowerCase();

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

  const config = getCheckinStatusConfig(status);
  if (!config) return undefined;
  return {
    value: status,
    label: status === 'checked-in' ? 'Checked in' : config.label,
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
