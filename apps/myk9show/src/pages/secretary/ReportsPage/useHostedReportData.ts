/**
 * Async data that report components need but must not fetch themselves.
 *
 * MYK9-280: `ReportPreview` renders every report through
 * `ReactDOMServer.renderToStaticMarkup`, which renders into a detached tree with
 * NO provider context. A report component that calls a React Query hook throws
 * `No QueryClient set` there, and the error boundary replaces the whole preview —
 * in a production build the cause is minified away, so it presents as "Failed to
 * load component" with no clue. Two shipped reports were unreachable this way.
 *
 * The fix is not to wrap the detached render in a provider: `renderToStaticMarkup`
 * is synchronous, so a freshly-mounted query would only ever emit its loading
 * state and the report would print placeholder text instead of data. The fetch has
 * to finish BEFORE the markup is produced, which means it belongs to the host.
 *
 * MYK9-721: called ONCE, by ReportsPage, which hands the result to ReportPreview.
 * `hostedState` comes from the same `resolveReportReadiness` rule as the report
 * rows, so Print and the preview gate on one answer. Both reads here are
 * online-only PostgREST (no replica holds entry-form or judge-supply rows), so
 * they keep the default 'online' network mode: offline they pause, a paused read
 * with no rows is `unavailable`, and a paused refetch over settled rows is
 * printable.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import {
  readinessOf,
  resolveReportReadiness,
  useIsOnline,
  type ReadinessQuery,
  type ReportDataState,
} from '@/hooks/queries/reportReadiness';
import { trialJudgeSuppliesService } from '@/features/judge-supplies/trialJudgeSuppliesService';
import type { ReportAsyncData, ReportEntryFormData } from '@/lib/reports/types';

/** Report ids whose component needs entry-form data passed in. */
export const ENTRY_FORM_REPORT_IDS = new Set(['akc-scent-work-entry-form']);

/** Report ids whose component needs judge-supply rows passed in. */
export const JUDGE_SUPPLY_REPORT_IDS = new Set(['judge-supply-checklist']);

export interface HostedReportDataOptions {
  reportType: string;
  showId: string | undefined;
  trialId?: string | undefined;
  dogId?: string | undefined;
}

export interface HostedReportData {
  entryFormData?: ReportEntryFormData;
  judgeSupplies?: ReportAsyncData<unknown[]>;
  /**
   * Readiness of the hosted reads the selected report needs; `ready` when it
   * needs none. The preview writes markup only at `ready`: writing earlier
   * bakes the empty state into the iframe and never revisits it, which is the
   * blank-form failure this module exists to prevent.
   */
  hostedState: ReportDataState;
  /** Ask the hosted reads again (the preview's Try again). */
  refetch: () => void;
}

/** For hosts that render no hosted report (tests, and the default prop). */
export const NO_HOSTED_REPORT_DATA: HostedReportData = { hostedState: 'ready', refetch: () => {} };

export function useHostedReportData({
  reportType,
  showId,
  trialId,
  dogId,
}: HostedReportDataOptions): HostedReportData {
  const isOnline = useIsOnline();
  const queryClient = useQueryClient();
  const needsEntryForm = ENTRY_FORM_REPORT_IDS.has(reportType) && Boolean(showId);
  const needsSupplies = JUDGE_SUPPLY_REPORT_IDS.has(reportType) && Boolean(showId);

  const entryForm = useEntryFormData({
    showId: showId ?? '',
    trialId,
    dogId,
    enabled: needsEntryForm,
  });

  const supplies = useQuery({
    queryKey: ['judge-supply-checklist-report', showId ?? ''] as const,
    queryFn: () => trialJudgeSuppliesService.listForShow(showId as string),
    enabled: needsSupplies,
  });

  const needed: ReadinessQuery[] = [
    ...(needsEntryForm ? [entryForm.readiness] : []),
    ...(needsSupplies ? [readinessOf(supplies)] : []),
  ];
  const hostedState = resolveReportReadiness(needed, { isOnline });

  const entryFormData: ReportEntryFormData | undefined = needsEntryForm
    ? {
        dogs: entryForm.dogs,
        secretary: entryForm.secretary,
        trials: entryForm.trials,
        show: entryForm.show,
        isLoading: entryForm.isLoading,
        isError: entryForm.isError,
      }
    : undefined;

  const judgeSupplies: ReportAsyncData<unknown[]> | undefined = needsSupplies
    ? {
        data: supplies.data ?? [],
        isLoading: supplies.isLoading,
        isError: Boolean(supplies.error),
      }
    : undefined;

  return {
    ...(entryFormData ? { entryFormData } : {}),
    ...(judgeSupplies ? { judgeSupplies } : {}),
    hostedState,
    refetch: () => {
      if (needsEntryForm) {
        void queryClient.invalidateQueries({ queryKey: ['entry-form-data', showId] });
      }
      if (needsSupplies) void supplies.refetch();
    },
  };
}
