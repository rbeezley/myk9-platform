/**
 * The judge's day around one class, for the Results tab's Judge sign-off section (MYK9-1031).
 *
 * The judge initials (AKC) or signs (UKC, ASCA) the marked catalog once, at the END of their day,
 * for every class they judged that day (MYK9-1030). Grouping is Overview's: `groupClassesByJudgeDay`
 * (judge and trial DATE, so a day can span trials). Cancelled classes and classes where no dog ran
 * have nothing to sign and are left out of the group and its counts.
 *
 * Pure, so the grouping and the record/undo gates are tested on the real row shape.
 */
import { formatJudgeDayDate, groupClassesByJudgeDay } from '@/features/show-map/judgeDay';
import type { ReportScope } from '@/lib/reports/types';
import type { ResultsClassRow } from './buildResultsClassRows';

export interface JudgeSignOffGroupClass {
  id: string;
  name: string;
  trialLabel: string;
  runFinished: boolean;
  signedOffAt: string | null;
  /** Complete, status Completed, not yet signed: what one "Initialed" press records. */
  recordable: boolean;
}

export interface JudgeSignOffGroup {
  key: string;
  judgeName: string;
  /** "Sat, Oct 10", or an empty string when the trial has no date. */
  dayLabel: string;
  registryId: string;
  classes: readonly JudgeSignOffGroupClass[];
  finishedCount: number;
  signedCount: number;
  /** Every class of the day has finished, so the judge can initial the whole day. */
  dayComplete: boolean;
  /** The classes one record writes. Empty until the day is complete. */
  recordClassIds: readonly string[];
  /** The narrowest existing Result Catalog scope that covers the whole day. */
  catalogScope: ReportScope;
}

function catalogScopeFor(showId: string, group: readonly ResultsClassRow[]): ReportScope {
  const first = group[0]!;
  if (group.length === 1) {
    return { kind: 'class', showId, trialId: first.trialId, classId: first.id };
  }
  const trialIds = new Set(group.map(row => row.trialId));
  return trialIds.size === 1
    ? { kind: 'trial', showId, trialId: first.trialId }
    : { kind: 'show', showId };
}

/** The group the selected class belongs to, or null when nothing in its day needs a sign-off. */
export function buildJudgeSignOffGroup(
  showId: string,
  rows: readonly ResultsClassRow[],
  classId: string
): JudgeSignOffGroup | null {
  const days = groupClassesByJudgeDay(
    rows.map(row => ({
      id: row.id,
      trialDate: row.trialDate,
      judgeId: row.judgeId,
      judgeName: row.judgeName,
    }))
  );
  const day = [...days.values()].find(candidate => candidate.classIds.includes(classId));
  if (!day) return null;
  const byId = new Map(rows.map(row => [row.id, row] as const));
  const members = day.classIds
    .map(id => byId.get(id))
    .filter((row): row is ResultsClassRow => row !== undefined)
    .filter(row => row.phase !== 'cancelled' && row.phase !== 'no-dogs');
  if (members.length === 0) return null;

  const classes = members.map((row): JudgeSignOffGroupClass => ({
    id: row.id,
    name: row.name,
    trialLabel: row.trialLabel,
    runFinished: row.runFinished,
    signedOffAt: row.judgeSignedOffAt,
    recordable: row.signOffRecordable && row.judgeSignedOffAt === null,
  }));
  const dayComplete = classes.every(item => item.runFinished);
  return {
    key: day.key,
    judgeName: day.judgeName ?? '',
    dayLabel: formatJudgeDayDate(day.date),
    registryId: members[0]!.registryId,
    classes,
    finishedCount: classes.filter(item => item.runFinished).length,
    signedCount: classes.filter(item => item.signedOffAt !== null).length,
    dayComplete,
    recordClassIds: dayComplete ? classes.filter(item => item.recordable).map(item => item.id) : [],
    catalogScope: catalogScopeFor(showId, members),
  };
}
