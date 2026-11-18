import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import {
  calculateWhatIsLeft,
  type WhatIsLeft,
  type WhatIsLeftClass,
  type WhatIsLeftInput,
  type WhatIsLeftTrial,
} from './whatIsLeft';

/** A Results tab row, as the calculation of what is left reads a class. */
export function resultsRowToLeftClass(row: ResultsClassRow): WhatIsLeftClass {
  return {
    id: row.id,
    trialId: row.trialId,
    // No stored status: the row's phase already says a class is cancelled.
    expectedCount: row.expectedCount,
    scoredCount: row.scoredCount,
    releasedAt: row.releasedAt,
    phase: row.phase,
    takesJudgeSignOff: row.takesJudgeSignOff,
    judgeSignedOffAt: row.judgeSignedOffAt,
  };
}

/**
 * What the Results tab's rows leave to do. The tab carries no incidents or submissions, so only
 * the class lines are answered here; the rest report unknown rather than nothing, unless the
 * caller passes the send records (and the score history) it has read. Pass the show's trials to
 * get each registry's own lines, and its trusted entries for the unconfirmed pull flags
 * (MYK9-2145); without them that line counts nothing.
 */
export function calculateResultsRowsLeft(
  rows: readonly ResultsClassRow[],
  trials: readonly WhatIsLeftTrial[] = [],
  sent: Pick<WhatIsLeftInput, 'submissions' | 'scoreChanges' | 'handlerClashes'> & {
    entries?: WhatIsLeftInput['entries'] | undefined;
  } = {
    submissions: null,
  }
): WhatIsLeft {
  return calculateWhatIsLeft({
    classes: rows.map(resultsRowToLeftClass),
    trials,
    entries: sent.entries ?? [],
    incidents: null,
    submissions: sent.submissions,
    scoreChanges: sent.scoreChanges,
    handlerClashes: sent.handlerClashes,
  });
}
