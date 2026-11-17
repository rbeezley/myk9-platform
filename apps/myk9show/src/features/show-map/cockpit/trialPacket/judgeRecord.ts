import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { formatJudgeDayDate } from '@/features/show-map/judgeDay';
import { isUnsetJudgeName } from '@/utils/classJudgeDisplay';

import {
  buildJudgeReviews,
  judgeKeyOf,
  type ReviewClass,
  type ReviewEntryInfo,
  type ReviewJudge,
} from './judgeReview';
import type { ScoreCorrection } from './judgeReviewCorrections';

/** One trial's classes in the record. Each section starts on a new page of the PDF. */
export interface JudgeRecordSection {
  trialId: string;
  trialLabel: string;
  classes: ReviewClass[];
}

/**
 * One judge's record for one day (MYK9-1924 phase 2b): the classes that judge judged on that date,
 * by trial. `review` is the same shape the judge review packet prints, narrowed to the day.
 */
export interface JudgeRecord {
  /** `judge key | day`: one record per judge per day. */
  key: string;
  judgeKey: string;
  /** The judge's person id, or "" when the class carries none (then the record can only be saved). */
  judgeId: string;
  judgeName: string;
  registryId: string;
  /** `YYYY-MM-DD`. */
  day: string;
  dayLabel: string;
  sections: JudgeRecordSection[];
  review: ReviewJudge;
  classCount: number;
  pageCount: number;
  /** The judge's last class of the day is initialled (or signed): the record is offered. */
  ready: boolean;
}

const UKC_REMINDER = "UKC: give the judge a copy of the signed judge's book before they leave.";

/** The reminder shown with a UKC judge's record, or null for every other registry. */
export function judgeRecordReminder(registryId: string): string | null {
  return registryId.trim().toUpperCase() === 'UKC' ? UKC_REMINDER : null;
}

/**
 * The judge's records from the Results rows: one per judge per day, with only that judge's classes
 * on that day. A class that takes no sign-off, or has no judge, is left out as it is from the
 * review packet. Records come back in day order, then by judge.
 */
export function buildJudgeRecords(input: {
  rows: readonly ResultsClassRow[];
  entryInfo: readonly ReviewEntryInfo[];
  correctionsByEntryId: ReadonlyMap<string, readonly ScoreCorrection[]>;
}): JudgeRecord[] {
  const groups = new Map<string, ResultsClassRow[]>();
  for (const row of input.rows) {
    if (!row.takesJudgeSignOff || isUnsetJudgeName(row.judgeName)) continue;
    const key = `${judgeKeyOf(row)}|${row.trialDate}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }

  const records: JudgeRecord[] = [];
  for (const [key, group] of groups) {
    const [review] = buildJudgeReviews({ ...input, rows: group });
    if (!review) continue;
    const trialOf = new Map(group.map(row => [row.id, row]));
    const sections: JudgeRecordSection[] = [];
    for (const item of review.classes) {
      const row = trialOf.get(item.classId)!;
      let section = sections.find(candidate => candidate.trialId === row.trialId);
      if (!section) {
        section = { trialId: row.trialId, trialLabel: row.trialLabel, classes: [] };
        sections.push(section);
      }
      section.classes.push(item);
    }
    const first = group[0]!;
    records.push({
      key,
      judgeKey: review.key,
      judgeId: first.judgeId.trim(),
      judgeName: review.judgeName,
      registryId: review.registryId,
      day: first.trialDate,
      dayLabel: formatJudgeDayDate(first.trialDate),
      sections,
      review,
      classCount: review.classes.length,
      pageCount: review.pageTotal,
      ready: review.initialled,
    });
  }
  return records.sort(
    (a, b) => a.day.localeCompare(b.day) || a.judgeName.localeCompare(b.judgeName)
  );
}

/** "Pat Donovan · Mon, Dec 7 · 4 classes". */
export function judgeRecordSummary(record: JudgeRecord): string {
  const classes = `${record.classCount} ${record.classCount === 1 ? 'class' : 'classes'}`;
  return `${record.judgeName} · ${record.dayLabel} · ${classes}`;
}
