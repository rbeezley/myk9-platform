import { compactFingerprint } from './paperworkFingerprint.ts';

/**
 * The print-evidence descriptor for the check-in sheet and the scoresheet (MYK9-2086).
 *
 * Declared here with NO app-alias imports so a Deno edge function can compute the same
 * fingerprint the app stores when a print is confirmed. The app's `ReportScope` is
 * structurally identical to `PaperworkScope`.
 */
export type PaperworkScope =
  | { kind: 'show'; showId: string }
  | { kind: 'trial'; showId: string; trialId: string }
  | { kind: 'class'; showId: string; trialId: string; classId: string };

export interface PaperworkSubject {
  key: string;
  facts: unknown;
  classIds?: readonly string[] | undefined;
  trialIds?: readonly string[] | undefined;
}

export interface PaperworkCoverage extends Record<string, unknown> {
  scopeKind: PaperworkScope['kind'];
  scope: PaperworkScope;
  subjectFingerprints: Record<string, string>;
  subjectScopes: Record<string, { classIds: readonly string[]; trialIds: readonly string[] }>;
  /**
   * Set only by artifacts whose identity is a trial DAY, today just the emergency packet.
   * `ReportScope` has no 'day' kind, so two days of one show both write show-scoped rows;
   * when present on both sides it must match (MYK9-228 phase 5).
   */
  trialDate?: string;
  /**
   * Which generated packet was printed. Read alongside `trialDate` by the print reminder:
   * a confirmation for a SUPERSEDED snapshot means the box holds paper the evening
   * regeneration has already invalidated.
   */
  snapshotId?: string;
}

export interface PaperworkDescriptor {
  reportId: string;
  scope: PaperworkScope;
  coverage: PaperworkCoverage;
  fingerprint: string;
}

export interface CheckInPaperworkEntry {
  entryId: string;
  classId: string;
  dogId: string;
  armband: number | null;
  runOrder: number | null;
  checkInStatus: string | null;
  trialId?: string | undefined;
  /**
   * `entries.entry_status`. A move-up leaves the source entry in its class with every other fact
   * unchanged, and a withdrawal does the same, so without it the class would read as printed
   * after either (MYK9-2074).
   */
  entryStatus?: string | null | undefined;
}

export interface ScoreSheetPaperworkEntry extends CheckInPaperworkEntry {
  section?: string | null;
}

export interface PaperworkClassFacts {
  classId: string;
  trialId: string;
  facts: Record<string, unknown>;
}

export function buildDescriptor(
  reportId: string,
  scope: PaperworkScope,
  subjects: readonly PaperworkSubject[],
  dayIdentity?: { trialDate: string; snapshotId: string }
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
      ...(dayIdentity
        ? { trialDate: dayIdentity.trialDate, snapshotId: dayIdentity.snapshotId }
        : {}),
    },
    fingerprint: compactFingerprint(subjectFingerprints),
  };
}

export function buildCheckInPaperworkDescriptor(
  scope: PaperworkScope,
  entries: readonly CheckInPaperworkEntry[],
  classes: readonly PaperworkClassFacts[] = []
): PaperworkDescriptor {
  return buildDescriptor('check-in-sheet', scope, [
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

export function buildScoreSheetPaperworkDescriptor(
  scope: PaperworkScope,
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
