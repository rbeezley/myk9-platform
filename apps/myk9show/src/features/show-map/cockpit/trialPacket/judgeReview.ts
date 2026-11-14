import { formatJudgeDayDate } from '@/features/show-map/judgeDay';
import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { isUnsetJudgeName } from '@/utils/classJudgeDisplay';

import { correctionLine, type ScoreCorrection } from './judgeReviewCorrections';

/** Lines one results page holds. A correction note takes a line of its own. */
export const REVIEW_PAGE_CAPACITY = 28;

export interface ReviewLine {
  entryId: string;
  armband: string;
  dogName: string;
  handlerName: string;
  /** "Q, 1st", "NQ: left the ring", "ABS", "Pending". */
  result: string;
  time: string;
  faults: string;
  /** The "Changed after you submitted" note, or "" when the score stands as submitted. */
  correctionNote: string;
}

export interface ReviewPage {
  lines: ReviewLine[];
}

export interface ReviewClass {
  classId: string;
  name: string;
  trialLabel: string;
  dayLabel: string;
  /** The class's lines split into the pages the judge initials: one page minimum. */
  pages: ReviewPage[];
}

export interface ReviewJudge {
  key: string;
  judgeName: string;
  registryId: string;
  classes: ReviewClass[];
  pageTotal: number;
  /** Every class of the judge has finished scoring. */
  done: boolean;
  /** Done, and every class has its sign-off recorded. */
  initialled: boolean;
  /** Finished classes out of all the judge's classes. */
  finishedCount: number;
}

/** What the entries table knows that the Results row does not: the reason behind a result. */
export interface ReviewEntryInfo {
  id: string;
  disqualification_reason?: string | null;
}

function ordinal(place: number): string {
  const mod100 = place % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${place}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th';
  return `${place}${suffix}`;
}

function resultText(
  entry: ResultsClassRow['entries'][number],
  reason: string | null | undefined
): string {
  const place = entry.qualified && entry.placement ? `, ${ordinal(entry.placement)}` : '';
  const why = !entry.qualified && reason?.trim() ? `: ${reason.trim()}` : '';
  return `${entry.resultLabel}${place}${why}`;
}

/** Splits lines into pages without leaving a correction note on a different page than its line. */
export function paginateReviewLines(lines: readonly ReviewLine[]): ReviewPage[] {
  const pages: ReviewPage[] = [];
  let current: ReviewLine[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.correctionNote ? 2 : 1;
    if (used + cost > REVIEW_PAGE_CAPACITY && current.length > 0) {
      pages.push({ lines: current });
      current = [];
      used = 0;
    }
    current.push(line);
    used += cost;
  }
  pages.push({ lines: current });
  return pages;
}

function judgeKeyOf(row: ResultsClassRow): string {
  return row.judgeId.trim()
    ? `judge:${row.judgeId.trim()}`
    : `name:${row.judgeName.trim().toLowerCase()}`;
}

/**
 * One review packet per judge from the Results rows: only the judge's own classes, in the order
 * they were judged (the rows arrive in trial and schedule order). A class that takes no sign-off
 * (cancelled, empty, every dog pulled) has nothing to initial and is left out, as is a class with
 * no judge, since nobody can initial it. Corrections come from the score history by entry id.
 */
export function buildJudgeReviews(input: {
  rows: readonly ResultsClassRow[];
  entryInfo: readonly ReviewEntryInfo[];
  correctionsByEntryId: ReadonlyMap<string, readonly ScoreCorrection[]>;
}): ReviewJudge[] {
  const reasons = new Map(input.entryInfo.map(info => [info.id, info.disqualification_reason]));
  const judges = new Map<string, ReviewJudge>();
  for (const row of input.rows) {
    if (!row.takesJudgeSignOff || isUnsetJudgeName(row.judgeName)) continue;
    const key = judgeKeyOf(row);
    let judge = judges.get(key);
    if (!judge) {
      judge = {
        key,
        judgeName: row.judgeName.trim(),
        registryId: row.registryId,
        classes: [],
        pageTotal: 0,
        done: true,
        initialled: true,
        finishedCount: 0,
      };
      judges.set(key, judge);
    }
    const lines = row.entries.map((entry): ReviewLine => ({
      entryId: entry.entryId,
      armband: entry.armband,
      dogName: entry.dogName,
      handlerName: entry.handlerName,
      result: resultText(entry, reasons.get(entry.entryId)),
      time: entry.timeLabel,
      faults: entry.faults === null ? '' : String(entry.faults),
      correctionNote: correctionLine(input.correctionsByEntryId.get(entry.entryId) ?? []),
    }));
    judge.classes.push({
      classId: row.id,
      name: row.name,
      trialLabel: row.trialLabel,
      dayLabel: formatJudgeDayDate(row.trialDate),
      pages: paginateReviewLines(lines),
    });
    judge.done &&= row.runFinished;
    judge.initialled &&= row.runFinished && row.judgeSignedOffAt !== null;
    if (row.runFinished) judge.finishedCount += 1;
  }
  return [...judges.values()].map(judge => ({
    ...judge,
    pageTotal: judge.classes.reduce((sum, item) => sum + item.pages.length, 0),
  }));
}

export interface JudgeProgress {
  total: number;
  initialled: number;
  /** "2 of 3 judges initialled", in the registry's own word. */
  label: string;
}

/** Per-judge progress for Results: how many judges' classes are all signed off. */
export function judgeProgress(judges: readonly ReviewJudge[], doneWord: string): JudgeProgress {
  const initialled = judges.filter(judge => judge.initialled).length;
  return {
    total: judges.length,
    initialled,
    label: `${initialled} of ${judges.length} ${judges.length === 1 ? 'judge' : 'judges'} ${doneWord}`,
  };
}

/** "Pat Donovan · 4 classes · 6 pages to initial". */
export function reviewSummary(judge: ReviewJudge): string {
  const classes = `${judge.classes.length} ${judge.classes.length === 1 ? 'class' : 'classes'}`;
  const pages = `${judge.pageTotal} ${judge.pageTotal === 1 ? 'page' : 'pages'} to initial`;
  return `${judge.judgeName} · ${classes} · ${pages}`;
}
