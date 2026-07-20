import type { ReportScope } from '@/lib/reports/types';

export interface PaperworkSubject {
  key: string;
  facts: unknown;
}

export interface PaperworkCoverage {
  scopeKind: ReportScope['kind'];
  subjectFingerprints: Record<string, string>;
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
}

export interface ArmbandPaperworkDog {
  dogId: string;
  calendarDay: string;
  armband: number;
  callName: string;
  handlerName: string;
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
  subjects: readonly PaperworkSubject[]
): PaperworkDescriptor {
  const subjectFingerprints = Object.fromEntries(
    [...subjects]
      .sort((left, right) => left.key.localeCompare(right.key))
      .map(subject => [subject.key, compactFingerprint(subject.facts)])
  );
  return {
    reportId,
    scope,
    coverage: { scopeKind: scope.kind, subjectFingerprints },
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
    }))
  );
}

export function buildScoreSheetPaperworkDescriptor(
  scope: ReportScope,
  entries: readonly ScoreSheetPaperworkEntry[],
  classFacts: Record<string, unknown>
): PaperworkDescriptor {
  return buildDescriptor('scoresheet', scope, [
    ...entries.map(entry => ({ key: `entry:${entry.entryId}`, facts: entry })),
    { key: `class:${scope.kind === 'class' ? scope.classId : 'selection'}`, facts: classFacts },
  ]);
}

export function buildResultPaperworkDescriptor(
  reportId: 'results-sheet' | 'result-labels',
  scope: ReportScope,
  entries: readonly ResultPaperworkEntry[]
): PaperworkDescriptor {
  return buildDescriptor(
    reportId,
    scope,
    entries.map(entry => ({ key: `entry:${entry.entryId}`, facts: entry }))
  );
}

export function buildArmbandPaperworkDescriptor(
  scope: ReportScope,
  dogs: readonly ArmbandPaperworkDog[]
): PaperworkDescriptor {
  return buildDescriptor(
    'armband-labels',
    scope,
    dogs.map(dog => ({ key: `dog-day:${dog.dogId}:${dog.calendarDay}`, facts: dog }))
  );
}

function readCoverage(record: PaperworkPrintEvidence): PaperworkCoverage | null {
  const scopeKind = record.coverage.scopeKind;
  const subjectFingerprints = record.coverage.subjectFingerprints;
  if (
    (scopeKind !== 'show' && scopeKind !== 'trial' && scopeKind !== 'class') ||
    !subjectFingerprints ||
    typeof subjectFingerprints !== 'object' ||
    Array.isArray(subjectFingerprints)
  ) {
    return null;
  }
  return {
    scopeKind,
    subjectFingerprints: subjectFingerprints as Record<string, string>,
  };
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
        return (
          coverage !== null &&
          Object.keys(currentSubjects).every(key => key in coverage.subjectFingerprints)
        );
      }
    )
    .sort((left, right) => right.record.printedAt.localeCompare(left.record.printedAt));

  const latest = candidates[0];
  if (!latest) return { state: 'unconfirmed', record: null, staleSubjectKeys: [] };

  const staleSubjectKeys = Object.entries(currentSubjects)
    .filter(([key, fingerprint]) => latest.coverage.subjectFingerprints[key] !== fingerprint)
    .map(([key]) => key);
  return {
    state: staleSubjectKeys.length > 0 ? 'stale' : 'current',
    record: latest.record,
    staleSubjectKeys,
  };
}
