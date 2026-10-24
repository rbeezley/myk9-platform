import { useMemo } from 'react';

import { useTrialOfficials } from '@/hooks/queries/useTrialOfficials';
import { useUKCTrialReportContext } from '@/hooks/queries/useUKCTrialReportContext';
import { buildClassReportProps, buildTrialReportProps } from './reportDataMapping';
import { getReportById } from '@/lib/reports/reportRegistry';
import { useAKCOfficialPdfAction } from './useAKCOfficialPdfAction';

const UKC_TRIAL_REPORT_TYPES = new Set(['ukc-nosework-trial-report', 'trial-secretary-report']);

// MYK9-1386: the AKC Trial Chair's / Secretary's Report print the named officials.
// Only these two, and only for a non-UKC trial ('trial-secretary-report' also
// serves UKC, which reads its officials through the UKC context above).
const AKC_OFFICIALS_REPORT_TYPES = new Set(['trial-chairman-report', 'trial-secretary-report']);

/** The page's official-form download: the report props it builds, and the action over them. */
export function useOfficialReportDownload(input: {
  reportType: string;
  showId: string | undefined;
  currentShowName: string | undefined;
  show: Parameters<typeof buildTrialReportProps>[0]['show'] | null | undefined;
  trials: unknown;
  classes: unknown;
  entries: unknown;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  isReady: boolean;
}) {
  const { reportType, showId, currentShowName, show, trialId, classId, dogId, sortOrder, isReady } =
    input;
  const trials = input.trials as Parameters<typeof buildTrialReportProps>[0]['trials'];
  const classes = input.classes as Parameters<typeof buildTrialReportProps>[0]['classes'];
  const entries = input.entries as Parameters<typeof buildTrialReportProps>[0]['entries'];

  // Scoped by the selected trial's actual registry, not just the reportType
  // string: 'trial-secretary-report' serves both AKC and UKC trials, and the
  // AKC one never reads this context, so it should not fetch officials'
  // personal contact data it will never print (MYK9-828 review).
  const selectedTrialIsUKC = useMemo(() => {
    const trial = (
      trials as unknown as Array<{ id: string; registry_id?: string | null }> | undefined
    )?.find(t => t.id === trialId);
    return trial?.registry_id?.trim().toUpperCase() === 'UKC';
  }, [trials, trialId]);

  const ukcTrialReportContextQuery = useUKCTrialReportContext(
    show?.id,
    UKC_TRIAL_REPORT_TYPES.has(reportType) && selectedTrialIsUKC
  );

  const officialsQuery = useTrialOfficials(
    show?.id,
    AKC_OFFICIALS_REPORT_TYPES.has(reportType) && !selectedTrialIsUKC && trialId !== 'all'
  );

  const omitHeldEntries = getReportById(reportType)?.excludesHeldEntries === true;

  const officialPdfProps = useMemo(() => {
    if (!show || trialId === 'all') return null;
    const props = buildTrialReportProps({
      show,
      trials,
      classes,
      entries,
      scope:
        trialId === 'all'
          ? { kind: 'show', showId: show.id }
          : { kind: 'trial', showId: show.id, trialId },
      sortOrder,
      omitHeldEntries,
    })[0];
    if (!props) return null;
    return {
      ...props,
      ukcTrialReportContext: ukcTrialReportContextQuery.data ?? null,
      officials: officialsQuery.data ?? null,
    };
  }, [
    show,
    trials,
    classes,
    entries,
    trialId,
    sortOrder,
    omitHeldEntries,
    ukcTrialReportContextQuery.data,
    officialsQuery.data,
  ]);

  const officialClassPdfProps = useMemo(() => {
    if (!show || trialId === 'all' || classId === 'all') return null;
    return buildClassReportProps({
      show,
      trials,
      classes,
      entries,
      scope: { kind: 'class', showId: show.id, trialId, classId },
      sortOrder,
      omitHeldEntries,
    });
  }, [show, trials, classes, entries, trialId, classId, sortOrder, omitHeldEntries]);

  return useAKCOfficialPdfAction({
    reportType,
    showId,
    showName: show?.name,
    currentShowName,
    isDataReady: isReady,
    hasShow: Boolean(show),
    trialId,
    classId,
    dogId,
    officialPdfProps,
    officialClassPdfProps,
    ukcTrialReportContextLoading:
      UKC_TRIAL_REPORT_TYPES.has(reportType) &&
      selectedTrialIsUKC &&
      ukcTrialReportContextQuery.isLoading,
    officialsLoading: officialsQuery.isLoading,
  });
}
