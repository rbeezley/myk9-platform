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
 * Called ONCE, by ReportsPage, which hands the result to ReportPreview. Print and
 * the preview frame gate on the same `isHostedDataBusy`, so neither can act on a
 * report whose hosted data is loading or refreshing (MYK9-717).
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryClient';
import {
  getHandlerPeopleHydrationRevision,
  subscribeHandlerPeopleHydration,
} from '@/services/database/entries/handlerHydration';
import { useEntryFormData } from '@/hooks/queries/useEntryFormData';
import { trialJudgeSuppliesService } from '@/features/judge-supplies/trialJudgeSuppliesService';
import { getWaitlistReportRows } from '@/services/database/waitlists';
import type { ReportAsyncData, ReportEntryFormData, ReportWaitlistRow } from '@/lib/reports/types';

/** Report ids whose component needs entry-form data passed in. */
export const ENTRY_FORM_REPORT_IDS = new Set(['akc-scent-work-entry-form']);

/** Report ids whose component needs judge-supply rows passed in. */
export const JUDGE_SUPPLY_REPORT_IDS = new Set(['judge-supply-checklist']);

/** Report ids whose component needs `waitlist_entries` rows passed in (MYK9-717). */
export const WAITLIST_REPORT_IDS = new Set(['waitlist-report']);

export interface HostedReportDataOptions {
  reportType: string;
  showId: string | undefined;
  trialId?: string | undefined;
  dogId?: string | undefined;
}

export interface HostedReportData {
  entryFormData?: ReportEntryFormData;
  judgeSupplies?: ReportAsyncData<unknown[]>;
  waitlist?: ReportAsyncData<ReportWaitlistRow[]>;
  /**
   * True while the selected report's hosted data is loading OR refreshing in the
   * background. The one readiness signal for hosted reports: the preview blanks
   * its frame rather than show a previous report or a superseded copy of this
   * one, and Print is disabled. Rendering early would bake the empty state into
   * the iframe, which is the blank-form failure this module exists to prevent.
   */
  isHostedDataBusy: boolean;
}

export function useHostedReportData({
  reportType,
  showId,
  trialId,
  dogId,
}: HostedReportDataOptions): HostedReportData {
  const needsEntryForm = ENTRY_FORM_REPORT_IDS.has(reportType) && Boolean(showId);
  const needsSupplies = JUDGE_SUPPLY_REPORT_IDS.has(reportType) && Boolean(showId);
  const needsWaitlist = WAITLIST_REPORT_IDS.has(reportType) && Boolean(showId);

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

  const queryClient = useQueryClient();
  const waitlistKey = queryKeys.showWaitlistReport(showId ?? '');
  const waitlistQuery = useQuery({
    queryKey: waitlistKey,
    queryFn: () => getWaitlistReportRows(showId as string),
    enabled: needsWaitlist,
    // A local replica read: re-read on every open so the paper matches the Waitlist tab.
    staleTime: 0,
  });

  // Handler names can arrive after the first read returned (loadHandlerPeople
  // answers from cache and finishes in the background); re-read when they do.
  const handlerPeopleRevision = useSyncExternalStore(
    subscribeHandlerPeopleHydration,
    getHandlerPeopleHydrationRevision,
    getHandlerPeopleHydrationRevision
  );
  const seenRevision = useRef(handlerPeopleRevision);
  const waitlistKeyShowId = waitlistKey[1];
  useEffect(() => {
    if (handlerPeopleRevision === seenRevision.current) return;
    seenRevision.current = handlerPeopleRevision;
    if (!needsWaitlist) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.showWaitlistReport(waitlistKeyShowId),
    });
  }, [handlerPeopleRevision, needsWaitlist, queryClient, waitlistKeyShowId]);

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

  const waitlist: ReportAsyncData<ReportWaitlistRow[]> | undefined = needsWaitlist
    ? {
        data: waitlistQuery.data ?? [],
        isLoading: waitlistQuery.isLoading,
        isError: Boolean(waitlistQuery.error),
      }
    : undefined;

  return {
    ...(entryFormData ? { entryFormData } : {}),
    ...(judgeSupplies ? { judgeSupplies } : {}),
    ...(waitlist ? { waitlist } : {}),
    isHostedDataBusy:
      (needsEntryForm && (entryForm.isLoading || entryForm.isFetching)) ||
      (needsSupplies && supplies.isFetching) ||
      (needsWaitlist && waitlistQuery.isFetching),
  };
}

/** For hosts that render no hosted report (tests, and the default prop). */
export const NO_HOSTED_REPORT_DATA: HostedReportData = { isHostedDataBusy: false };
