/**
 * MYK9-1030: a judge's day — every class one judge judges on one calendar date.
 *
 * The judge initials (AKC) or signs (UKC, ASCA) the marked catalog once, at the END of that
 * day, for all of those classes together. A judge's day can span trials (a Saturday with Trial 1
 * and Trial 2), so it is keyed on the judge and the trial DATE, never the trial.
 *
 * The judge is the class's confirmed judge assignment (`judge_assignments.person_id`, carried as
 * `judgeId`); the name is only a fallback for a row whose id did not resolve. A class with no
 * judge or no date is a day of its own, so it can still be signed off.
 *
 * Pure and component-free so the Show Map, the cockpit, the Reports page and the Results tab
 * (MYK9-1031) group the same way.
 */
import { formatEntryDate } from '@/lib/format/dates';

export interface JudgeDayClassInput {
  id: string;
  trialDate?: string | null | undefined;
  judgeId?: string | null | undefined;
  judgeName?: string | null | undefined;
}

export interface JudgeDay {
  key: string;
  judgeId?: string | undefined;
  judgeName?: string | undefined;
  /** `YYYY-MM-DD`, the trial date. */
  date?: string | undefined;
  classIds: string[];
}

function judgeIdentity(cls: JudgeDayClassInput): string | null {
  const id = cls.judgeId?.trim();
  if (id) return `judge:${id}`;
  const name = cls.judgeName?.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** The key two classes share exactly when the same judge judges both on the same date. */
export function judgeDayKey(cls: JudgeDayClassInput): string {
  const judge = judgeIdentity(cls);
  const date = cls.trialDate?.trim();
  return judge && date ? `${judge}|${date}` : `class:${cls.id}`;
}

/** Every judge's day among `classes`, keyed by `judgeDayKey`, classes in input order. */
export function groupClassesByJudgeDay(
  classes: readonly JudgeDayClassInput[]
): Map<string, JudgeDay> {
  const days = new Map<string, JudgeDay>();
  for (const cls of classes) {
    const key = judgeDayKey(cls);
    const day = days.get(key);
    if (day) {
      day.classIds.push(cls.id);
      continue;
    }
    const isOwnDay = key.startsWith('class:');
    days.set(key, {
      key,
      ...(!isOwnDay && cls.judgeId?.trim() ? { judgeId: cls.judgeId.trim() } : {}),
      ...(cls.judgeName?.trim() ? { judgeName: cls.judgeName.trim() } : {}),
      ...(cls.trialDate?.trim() ? { date: cls.trialDate.trim() } : {}),
      classIds: [cls.id],
    });
  }
  return days;
}

/**
 * The judge's days that still have a class to run: some class in the day is neither finished
 * nor cancelled. A complete class in such a day waits for the end-of-day sign-off.
 */
export function openJudgeDayKeys(
  classes: ReadonlyArray<JudgeDayClassInput & { finished: boolean }>
): Set<string> {
  const open = new Set<string>();
  for (const cls of classes) {
    if (!cls.finished) open.add(judgeDayKey(cls));
  }
  return open;
}

/** "Sat, Oct 10" — the day as the sign-off action names it. */
export function formatJudgeDayDate(date: string | null | undefined): string {
  const full = formatEntryDate(date);
  // formatEntryDate gives "Sat, Oct 10, 2026"; the year adds nothing on show day.
  return full.replace(/, \d{4}$/, '');
}
