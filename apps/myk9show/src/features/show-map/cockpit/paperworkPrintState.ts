import { armbandLabelFacts, armbandLabelSubjectKey } from '@/lib/labels/armbandSubjectKey';
import { deriveArmbandPrintState } from './armbandPrintState';
import type { ReportScope } from '@/lib/reports/types';
import {
  buildDescriptor,
  type PaperworkClassFacts,
  type PaperworkCoverage,
  type PaperworkDescriptor,
  type PaperworkSubject,
} from '../../../../../../supabase/functions/_shared/paperwork/descriptor.ts';

export {
  type PaperworkClassFacts,
  type PaperworkCoverage,
  type PaperworkDescriptor,
  type PaperworkSubject,
};

export interface PaperworkPrintEvidence {
  id: string;
  reportId: string;
  coverage: Record<string, unknown>;
  fingerprint: string;
  printedAt: string;
  printedByName: string;
  voidedAt?: string | undefined;
}

export interface ResultPaperworkEntry {
  entryId: string;
  classId: string;
  dogId: string;
  armband: number | null;
  resultStatus: string | null;
  placement: number | null;
  searchTimeSeconds: number | null;
  /** UKC element time (MYK9-2090); present only when recorded, so other registries hash as before. */
  elementTimeSeconds?: number;
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
      key: armbandLabelSubjectKey(dog),
      // The label's own content, never the classes the dog is in (MYK9-2073): a day print and a
      // one-dog print must read the same as the class print they cover.
      facts: armbandLabelFacts(dog),
      classIds: dog.classIds,
      trialIds: dog.trialIds,
    }))
  );
}

export const EMERGENCY_PACKET_REPORT_ID = 'emergency-trial-packet';

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
    EMERGENCY_PACKET_REPORT_ID,
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
    // Empty strings would produce subject key `packet-day:` and no
    // `coverage.trialDate`, i.e. a row the reminder can never join. Refuse
    // rather than write evidence nothing can read.
    {
      trialDate: requireNonEmpty(input.trialDate, 'trialDate'),
      snapshotId: requireNonEmpty(input.snapshotId, 'snapshotId'),
    }
  );
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Emergency packet print evidence needs a ${field}.`);
  }
  return trimmed;
}

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
  if (current.reportId === 'armband-labels') return deriveArmbandPrintState(records, current);
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
