/**
 * MYK9-1473: a class with a tie for a ribbon asks for its coin flip before the scores can be
 * checked. The tie list is a server read (`get_class_ties`), so it arrives after the rows are built
 * from the replica; this folds it in with the same two pure functions the builder uses, so the
 * phase, its label and the next action cannot drift from `resultsNextAction.ts`.
 */
import type { ResultsClassRow } from './buildResultsClassRows';
import {
  RESULTS_PHASE_LABEL,
  deriveResultsNextAction,
  deriveResultsPhase,
} from './resultsNextAction';

/** The rows that may owe a coin flip: complete, saved as completed, not yet checked. */
export function rowOwesTieCheck(row: ResultsClassRow): boolean {
  return row.phase === 'needs-checking' && row.statusCompleted;
}

export function applyCoinFlipPending(
  rows: readonly ResultsClassRow[],
  pendingClassIds: ReadonlySet<string>
): ResultsClassRow[] {
  if (pendingClassIds.size === 0) return [...rows];
  return rows.map(row => {
    if (!pendingClassIds.has(row.id) || !rowOwesTieCheck(row)) return row;
    const state = { ...row.state, coinFlipPending: true };
    const phase = deriveResultsPhase(state);
    return {
      ...row,
      state,
      phase,
      phaseLabel: RESULTS_PHASE_LABEL[phase],
      nextAction: deriveResultsNextAction(state),
    };
  });
}
