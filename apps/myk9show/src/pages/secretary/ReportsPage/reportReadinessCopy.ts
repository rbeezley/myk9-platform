import { mostBlockingState, type ReportDataState } from '@/hooks/queries/reportReadiness';

/**
 * What to say when Print is pressed on data that is not current. Each names the
 * situation and what will clear it, because "the report is still loading" was
 * wrong in most of these cases.
 */
const REPORT_ROWS_MESSAGE: Record<ReportDataState, string> = {
  loading: 'Still loading this show. Print once the preview finishes.',
  unavailable:
    'No connection, so the entries could not be checked. Reconnect before printing, or the report may be missing dogs.',
  stale: 'Still loading the trial you just picked. Print once the preview catches up.',
  refreshing: 'The report is updating with a change that just came in. Print once it finishes.',
  error: 'The entries could not be loaded. Use Try again below, then print.',
  ready: '',
};

/** The same, for the entry-form / judge-supply details a report is built from. */
const HOSTED_DETAILS_MESSAGE: Record<ReportDataState, string> = {
  loading: "Still loading this report's details. Print once the preview finishes.",
  unavailable:
    "No connection, so this report's details could not be loaded. Reconnect before printing, or the report may print blank.",
  stale: 'Still loading the selection you just picked. Print once the preview catches up.',
  refreshing: 'The report is updating with a change that just came in. Print once it finishes.',
  error: "This report's details could not be loaded. Use Try again below, then print.",
  ready: '',
};

export interface PrintReadiness {
  /** The one state Print obeys: the more blocking of the two sources. */
  state: ReportDataState;
  /** Why Print is refused, or null when it may print. */
  blockedMessage: string | null;
}

/**
 * Combine the report rows' readiness with the hosted details' readiness into
 * the single answer Print acts on. The report rows are named first when both
 * block, since they are the larger thing missing.
 */
export function resolvePrintReadiness(
  reportState: ReportDataState,
  hostedState: ReportDataState
): PrintReadiness {
  const state = mostBlockingState(reportState, hostedState);
  if (state === 'ready') return { state, blockedMessage: null };
  const blockedMessage =
    reportState === state ? REPORT_ROWS_MESSAGE[state] : HOSTED_DETAILS_MESSAGE[state];
  return { state, blockedMessage };
}
