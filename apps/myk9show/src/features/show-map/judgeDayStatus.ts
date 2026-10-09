/**
 * MYK9-1030/1031: which judge's days are still open, decided ONCE for every surface.
 *
 * The judge initials (AKC) or signs (UKC, ASCA) the marked catalog at the END of their day, which
 * can span trials. A day stays open while any of the judge's classes that day has something left
 * to run: a class is finished when its status is muted (cancelled), when it is KNOWN to have
 * nothing to run (`isClassConfirmedEmpty`: counts read, none expected, none on the run list, so a
 * class holding only entries waiting on acceptance is NOT empty), or when its run is complete
 * (`isClassRunComplete`).
 *
 * The Overview tree (`buildShowMapTree`) and the Results tab (`buildResultsClassRows`) both call
 * this, so "Initials at end of day" and "Needs judge's initials" can never disagree between them.
 */
import { judgeDayKey, openJudgeDayKeys } from './judgeDay';
import { classifyClassStatus, isClassConfirmedEmpty, isClassRunComplete } from './showMapStatus';
import type { ShowMapClassInput, ShowMapEntryInput } from './showMapTypes';

export interface JudgeDayStatus {
  /** Per class: its judge-day key, and whether the class itself has finished. */
  byClassId: ReadonlyMap<string, { dayKey: string; finished: boolean }>;
  /** The day keys that still have a class to run. */
  openDayKeys: ReadonlySet<string>;
}

export function classifyJudgeDays(
  classes: readonly ShowMapClassInput[],
  entriesByClassId: ReadonlyMap<string, ShowMapEntryInput[]>,
  /** The trial's date wins over the class's own, as the Overview tree has always read it. */
  trialDateByTrialId: ReadonlyMap<string, string | undefined>
): JudgeDayStatus {
  const inputs = classes.map(cls => ({
    id: cls.id,
    trialDate: trialDateByTrialId.get(cls.trialId) || cls.trialDate,
    judgeId: cls.judgeId,
    judgeName: cls.judgeName,
    finished:
      classifyClassStatus(cls.status)?.kind === 'muted' ||
      isClassConfirmedEmpty(cls) ||
      isClassRunComplete(cls, entriesByClassId.get(cls.id) ?? []),
  }));
  return {
    byClassId: new Map(
      inputs.map(input => [input.id, { dayKey: judgeDayKey(input), finished: input.finished }])
    ),
    openDayKeys: openJudgeDayKeys(inputs),
  };
}
