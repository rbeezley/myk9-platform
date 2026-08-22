import type { ReportScope } from '@/lib/reports/types';

export interface PaperworkSubject {
  key: string;
  facts: unknown;
  classIds?: readonly string[] | undefined;
  trialIds?: readonly string[] | undefined;
}

export interface PaperworkCoverage extends Record<string, unknown> {
  scopeKind: ReportScope['kind'];
  scope: ReportScope;
  subjectFingerprints: Record<string, string>;
  subjectScopes: Record<string, { classIds: readonly string[]; trialIds: readonly string[] }>;
  /**
   * Set only by artifacts whose identity is a trial DAY — today just the
   * emergency packet. `ReportScope` has no 'day' kind and cannot get one (a
   * day may hold three trials, a trial scope holds one id), so two days of one
   * show both write show-scoped rows and `scopeCovers` cannot tell them apart.
   * When present on both sides it must match, or Saturday's confirmation is
   * read as evidence about Sunday (MYK9-228 phase 5).
   */
  trialDate?: string;
}

export interface PaperworkDescriptor {
  reportId: string;
  scope: ReportScope;
  coverage: PaperworkCoverage;
  fingerprint: string;
}

export interface PaperworkPrintEvidence {
  id: string;
  reportId: string;
  coverage: Record<string, unknown>;
  fingerprint: string;
  printedAt: string;
  printedByName: string;
  voidedAt?: string | undefined;
}

export interface CheckInPaperworkEntry {
  entryId: string;
  classId: string;
  dogId: string;
  armband: number | null;
  runOrder: number | null;
  checkInStatus: string | null;
  trialId?: string | undefined;
}

export interface ScoreSheetPaperworkEntry extends CheckInPaperworkEntry {
  section?: string | null;
}

export interface ResultPaperworkEntry {
  entryId: string;
  classId: string;
  dogId: string;
  armband: number | null;
  resultStatus: string | null;
  placement: number | null;
  searchTimeSeconds: number | null;
  totalFaults: number | null;
  trialId?: string | undefined;
}

export interface ArmbandPaperworkDog {
  dogId: string;
  calendarDay: string;
  armband: number;
  callName: string;
  handlerName: string;
  classIds?: readonly string[] | undefined;
  trialIds?: readonly string[] | undefined;
}

export interface PaperworkClassFacts {
  classId: string;
  trialId: string;
  facts: Record<string, unknown>;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`
    )
    .join(',')}}`;
}

function compactFingerprint(value: unknown): string {
  const source = stableStringify(value);
  let hash = 14695981039346656037n;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= BigInt(source.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function buildDescriptor(
  reportId: string,
  scope: ReportScope,
  subjects: readonly PaperworkSubject[],
  trialDate?: string
): PaperworkDescriptor {
  const subjectFingerprints = Object.fromEntries(
    [...subjects]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(subject => [subject.key, compactFingerprint(subject.facts)])
  );
  const subjectScopes = Object.fromEntries(
    subjects.map(subject => [
      subject.key,
      {
        classIds: [...new Set(subject.classIds ?? [])].sort(),
        trialIds: [...new Set(subject.trialIds ?? [])].sort(),
      },
    ])
  );
  return {
    reportId,
    scope,
    coverage: {
      scopeKind: scope.kind,
      scope,
      subjectFingerprints,
      subjectScopes,
      ...(trialDate ? { trialDate } : {}),
    },
    fingerprint: compactFingerprint(subjectFingerprints),
  };
}

export function buildCheckInPaperworkDescriptor(
  scope: ReportScope,
  entries: readonly CheckInPaperworkEntry[]
): PaperworkDescriptor {
  return buildDescriptor(
    'check-in-sheet',
    scope,
    entries.map(entry => ({
      key: `entry:${entry.entryId}`,
      facts: entry,
      classIds: [entry.classId],
      trialIds: entry.trialId ? [entry.trialId] : [],
    }))
  );
}

export function buildScoreSheetPaperworkDescriptor(
  scope: ReportScope,
  entries: readonly ScoreSheetPaperworkEntry[],
  classes: readonly PaperworkClassFacts[]
): PaperworkDescriptor {
  return buildDescriptor('scoresheet', scope, [
    ...entries.map(entry => ({
      key: `entry:${entry.entryId}`,
      facts: entry,
      classIds: [entry.classId],
      trialIds: entry.trialId ? [entry.trialId] : [],
    })),
    ...classes.map(classItem => ({
      key: `class:${classItem.classId}`,
      facts: classItem.facts,
      classIds: [classItem.classId],
      trialIds: [classItem.trialId],
    })),
  ]);
}

export function buildResultPaperworkDescriptor(
  reportId: 'results-sheet' | 'result-labels',
  scope: ReportScope,
  entries: readonly ResultPaperworkEntry[],
  classes: readonly PaperworkClassFacts[] = []
): PaperworkDescriptor {
  return buildDescriptor(reportId, scope, [
    ...entries.map(entry => ({
      key: `entry:${entry.entryId}`,
      facts: entry,
      classIds: [entry.classId],
      trialIds: entry.trialId ? [entry.trialId] : [],
    })),
    ...classes.map(classItem => ({
      key: `class:${classItem.classId}`,
      facts: classItem.facts,
      classIds: [classItem.classId],
      trialIds: [classItem.trialId],
    })),
  ]);
}

export function buildArmbandPaperworkDescriptor(
  scope: ReportScope,
  dogs: readonly ArmbandPaperworkDog[]
): PaperworkDescriptor {
  return buildDescriptor(
    'armband-labels',
    scope,
    dogs.map(dog => ({
      key: `dog-day:${dog.dogId || `armband:${dog.armband}`}:${dog.calendarDay}`,
      facts: dog,
      classIds: dog.classIds,
      trialIds: dog.trialIds,
    }))
  );
}

/**
 * The packet is one artifact per trial DAY, but `ReportScope` has no 'day'
 * kind and cannot get one: a day may hold three trials while a trial scope
 * carries a single `trialId`. So the scope stays show-level and the DAY lives
 * in the subject key.
 *
 * That key is load-bearing in two places, which is why it is the date and not
 * the snapshot id it used to be (MYK9-228 phase 5):
 *
 *  1. Two days of one show both write show-scoped rows, so `scopeCovers` makes
 *     Saturday's confirmation a candidate for Sunday's descriptor. Keyed by
 *     snapshot, the fingerprints differed and Sunday resolved to STALE —
 *     "you printed an older version" — when the truth is nobody printed Sunday
 *     at all. Keyed by day, Saturday's subject is simply absent from Sunday's
 *     set and Sunday reads `unconfirmed`.
 *  2. The print reminder has to answer "is day D printed?" from the server,
 *     where the only evidence is this row. A snapshot UUID is unjoinable; a
 *     date is the answer.
 *
 * `snapshotId` and `generatedAt` stay in the FACTS, so reprinting after a
 * regeneration still reads as stale — which is correct, and is the distinction
 * the old key was conflating with "different day".
 */
export function buildEmergencyPacketPaperworkDescriptor(input: {
  showId: string;
  trialDate: string;
  snapshotId: string;
  generatedAt: string;
  entryIds: readonly string[];
  classIds: readonly string[];
  trialIds: readonly string[];
}): PaperworkDescriptor {
  return buildDescriptor(
    'emergency-trial-packet',
    { kind: 'show', showId: input.showId },
    [
      {
        key: emergencyPacketSubjectKey(input.trialDate),
        facts: {
          trialDate: input.trialDate,
          snapshotId: input.snapshotId,
          generatedAt: input.generatedAt,
          entryIds: [...input.entryIds].sort(),
        },
        classIds: input.classIds,
        trialIds: input.trialIds,
      },
    ],
    input.trialDate
  );
}

export const EMERGENCY_PACKET_REPORT_ID = 'emergency-trial-packet';

/** The one spelling of the key, shared by the writer and every reader. */
export function emergencyPacketSubjectKey(trialDate: string): string {
  return `packet-day:${trialDate}`;
}

function readCoverage(record: PaperworkPrintEvidence): PaperworkCoverage | null {
  const scopeKind = record.coverage.scopeKind;
  const subjectFingerprints = record.coverage.subjectFingerprints;
  const scope = record.coverage.scope;
  const subjectScopes = record.coverage.subjectScopes;
  if (
    (scopeKind !== 'show' && scopeKind !== 'trial' && scopeKind !== 'class') ||
    !subjectFingerprints ||
    typeof subjectFingerprints !== 'object' ||
    Array.isArray(subjectFingerprints)
  ) {
    return null;
  }
  const parsedScope =
    scope && typeof scope === 'object' && !Array.isArray(scope)
      ? (scope as ReportScope)
      : ({ kind: scopeKind } as ReportScope);
  return {
    scopeKind,
    scope: parsedScope,
    ...(typeof record.coverage.trialDate === 'string'
      ? { trialDate: record.coverage.trialDate }
      : {}),
    subjectFingerprints: subjectFingerprints as Record<string, string>,
    subjectScopes:
      subjectScopes && typeof subjectScopes === 'object' && !Array.isArray(subjectScopes)
        ? (subjectScopes as PaperworkCoverage['subjectScopes'])
        : {},
  };
}

function scopeCovers(record: PaperworkCoverage, current: ReportScope): boolean {
  const recordScope = record.scope;
  if (!('showId' in recordScope) || recordScope.showId !== current.showId) return false;
  if (recordScope.kind === 'show') return true;
  if (recordScope.kind === 'trial') {
    return current.kind !== 'show' && current.trialId === recordScope.trialId;
  }
  return current.kind === 'class' && current.classId === recordScope.classId;
}

function subjectBelongsToScope(
  subject: { classIds: readonly string[]; trialIds: readonly string[] },
  scope: ReportScope
): boolean {
  if (scope.kind === 'show') return true;
  if (scope.kind === 'trial') return subject.trialIds.includes(scope.trialId);
  return subject.classIds.includes(scope.classId);
}

export function derivePaperworkPrintState(
  records: readonly PaperworkPrintEvidence[],
  current: PaperworkDescriptor
): {
  state: 'current' | 'stale' | 'unconfirmed';
  record: PaperworkPrintEvidence | null;
  staleSubjectKeys: readonly string[];
} {
  const currentSubjects = current.coverage.subjectFingerprints;
  const candidates = records
    .filter(record => record.reportId === current.reportId && !record.voidedAt)
    .map(record => ({ record, coverage: readCoverage(record) }))
    .filter(
      (candidate): candidate is { record: PaperworkPrintEvidence; coverage: PaperworkCoverage } => {
        const coverage = candidate.coverage;
        if (coverage === null) return false;
        // A day-identified artifact is only described by a confirmation for
        // the SAME day. Without this, both days of a show write show-scoped
        // rows and Saturday's print reports Sunday as `stale` — "you printed
        // an older version" — when nobody printed Sunday at all. A record with
        // no day at all is not evidence about a dated one either; the worst
        // case of that strictness is one extra reminder.
        if (current.coverage.trialDate && coverage.trialDate !== current.coverage.trialDate) {
          return false;
        }
        if ('showId' in coverage.scope) return scopeCovers(coverage, current.scope);
        // Backward compatibility for confirmations written before scoped
        // coverage metadata existed. New records use the exact scope path above.
        return Object.keys(currentSubjects).every(key => key in coverage.subjectFingerprints);
      }
    )
    .sort((left, right) => right.record.printedAt.localeCompare(left.record.printedAt));

  const latest = candidates[0];
  if (!latest) return { state: 'unconfirmed', record: null, staleSubjectKeys: [] };

  const recordedSubjects = latest.coverage.subjectFingerprints;
  const scopedRecordedKeys =
    Object.keys(latest.coverage.subjectScopes).length > 0
      ? Object.entries(latest.coverage.subjectScopes)
          .filter(([, subjectScope]) => subjectBelongsToScope(subjectScope, current.scope))
          .map(([key]) => key)
      : Object.keys(recordedSubjects).filter(key => key in currentSubjects);
  const staleSubjectKeys = [...new Set([...Object.keys(currentSubjects), ...scopedRecordedKeys])]
    .filter(key => currentSubjects[key] !== recordedSubjects[key])
    .sort();
  return {
    state: staleSubjectKeys.length > 0 ? 'stale' : 'current',
    record: latest.record,
    staleSubjectKeys,
  };
}
