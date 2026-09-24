import type { ReportDataState } from '@/hooks/queries/useReportData';

/**
 * What to say when Print is pressed on data that is not current. Each names the
 * situation and what will clear it, because "the report is still loading" was
 * wrong in three of these four cases.
 */
export const PRINT_BLOCKED_MESSAGE: Record<ReportDataState, string> = {
  loading: 'Still loading this show. Print once the preview finishes.',
  unavailable:
    'No connection, so the entries could not be checked. Reconnect before printing, or the report may be missing dogs.',
  stale: 'Still loading the trial you just picked. Print once the preview catches up.',
  error: 'The entries could not be loaded. Use Try again below, then print.',
  ready: '',
};

/** Print pressed while a hosted report's own data is loading or refreshing (MYK9-717). */
export const HOSTED_DATA_BUSY_MESSAGE =
  'Still updating this report. Print once the preview finishes.';
