import { isUnsetJudgeName, judgeLine } from '@/utils/classJudgeDisplay';
import {
  formatClassEntryBreakdown,
  type ClassEntryBreakdown,
} from '@/features/entry-operations/classEntryBreakdown';
import { countLabel } from '@/utils/pluralize';

import type { FocusedClassModel } from './secretaryCockpitTypes';

/**
 * The facts line under the focused class's name. "2 of 2 scored" already says how many entries,
 * so the bare count is only the fallback when progress is unknown (owner, 2026-10-03). Before
 * scoring can begin the count is the schedule row's own, entered and pending (MYK9-1727), so the
 * header never says "0 entries" above a row that says "1 pending".
 */
export function buildFocusedClassFacts({
  focused,
  entryCount,
  breakdown,
  showJudge,
}: {
  focused: Pick<FocusedClassModel, 'progress' | 'lifecycle' | 'judgeName'>;
  /** The class's own entry count; the fallback while the entries are unread. */
  entryCount: number | null;
  /** Entered/pending from the entries read; absent until they are read. */
  breakdown: ClassEntryBreakdown | undefined;
  /** False when the Judge setting below already shows the judge. */
  showJudge: boolean;
}): string[] {
  const progress = focused.progress.value;
  // Same rule as the class card: before scoring can begin it would only read "0 of N".
  const scoringBegun =
    progress !== null &&
    (progress.completed > 0 ||
      focused.lifecycle.value === 'in-progress' ||
      focused.lifecycle.value === 'complete');
  const text = breakdown ? formatClassEntryBreakdown(breakdown) : undefined;
  const countFact = scoringBegun
    ? `${progress.completed} of ${progress.total} scored`
    : (text?.entered ?? (entryCount === null ? null : countLabel(entryCount, 'entry', 'entries')));
  const judgeFact =
    showJudge && !isUnsetJudgeName(focused.judgeName) ? judgeLine(focused.judgeName) : null;
  return [countFact, text?.pending ?? null, judgeFact].filter((fact): fact is string =>
    Boolean(fact)
  );
}
