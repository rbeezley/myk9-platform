import type { PaperworkDescriptor, PaperworkScope } from './descriptor.ts';

/**
 * Whether the latest print confirmation still describes a check-in sheet or scoresheet.
 *
 * The same rule as the app's `derivePaperworkPrintState` (paperworkPrintState.ts) for the two
 * paper sheets, so the server and a class card agree on "current" (MYK9-2086 part B):
 * - candidates are non-voided rows of this report whose recorded scope covers the class
 *   (same show; a show print covers every class, a trial print its trial's, a class print its own);
 * - the latest candidate by `printed_at` decides;
 * - it is current only when every subject fingerprint it recorded for this class, and every one
 *   the class has today, match.
 *
 * Deliberately stricter than the app in one place: a confirmation written before scoped coverage
 * existed (no `scope.showId`) never counts. The worst case is one extra reminder.
 */
export interface SheetPrintRow {
  report_id: string;
  coverage: unknown;
  printed_at: string;
  voided_at: string | null;
}

interface RecordedCoverage {
  scope: PaperworkScope;
  subjectFingerprints: Record<string, string>;
  subjectScopes: Record<string, { classIds?: readonly string[]; trialIds?: readonly string[] }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readCoverage(value: unknown): RecordedCoverage | null {
  if (!isObject(value)) return null;
  const { scope, subjectFingerprints, subjectScopes } = value;
  if (!isObject(scope) || typeof scope.showId !== 'string') return null;
  if (scope.kind !== 'show' && scope.kind !== 'trial' && scope.kind !== 'class') return null;
  if (!isObject(subjectFingerprints)) return null;
  return {
    scope: scope as unknown as PaperworkScope,
    subjectFingerprints: subjectFingerprints as Record<string, string>,
    subjectScopes: isObject(subjectScopes)
      ? (subjectScopes as RecordedCoverage['subjectScopes'])
      : {},
  };
}

function scopeCovers(recorded: PaperworkScope, current: PaperworkScope): boolean {
  if (recorded.showId !== current.showId) return false;
  if (recorded.kind === 'show') return true;
  if (recorded.kind === 'trial') {
    return current.kind !== 'show' && current.trialId === recorded.trialId;
  }
  return current.kind === 'class' && current.classId === recorded.classId;
}

function subjectBelongsToScope(
  subject: { classIds?: readonly string[]; trialIds?: readonly string[] },
  scope: PaperworkScope
): boolean {
  if (scope.kind === 'show') return true;
  if (scope.kind === 'trial') return (subject.trialIds ?? []).includes(scope.trialId);
  return (subject.classIds ?? []).includes(scope.classId);
}

export function sheetPrintIsCurrent(
  prints: readonly SheetPrintRow[],
  current: PaperworkDescriptor
): boolean {
  const currentSubjects = current.coverage.subjectFingerprints;
  const latest = prints
    .filter(row => row.report_id === current.reportId && !row.voided_at)
    .map(row => ({ row, coverage: readCoverage(row.coverage) }))
    .filter(
      (candidate): candidate is { row: SheetPrintRow; coverage: RecordedCoverage } =>
        candidate.coverage !== null && scopeCovers(candidate.coverage.scope, current.scope)
    )
    .sort((left, right) => right.row.printed_at.localeCompare(left.row.printed_at))[0];
  if (!latest) return false;

  const recorded = latest.coverage.subjectFingerprints;
  const recordedKeys =
    Object.keys(latest.coverage.subjectScopes).length > 0
      ? Object.entries(latest.coverage.subjectScopes)
          .filter(([, subjectScope]) => subjectBelongsToScope(subjectScope, current.scope))
          .map(([key]) => key)
      : Object.keys(recorded).filter(key => key in currentSubjects);
  return ![...new Set([...Object.keys(currentSubjects), ...recordedKeys])].some(
    key => currentSubjects[key] !== recorded[key]
  );
}
