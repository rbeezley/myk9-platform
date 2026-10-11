import { useState, useRef, useMemo, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPhaseSections } from './ReportPhaseSections';
import { useReportPrintStatus } from './useReportPrintStatus';
import { useFocusReportControls } from './useFocusReportControls';
import { resolveShowTimePhase } from '@/lib/reports/reportPhaseOrder';
import { getEntryWindowTimezone } from '@/utils/entryWindowDate';
import { ReportPreview } from './ReportPreview';
import { printIframe } from './reportPreviewUtils';
import { ArmbandLabelsReport } from '@/components/reports/labels/ArmbandLabelsReport';
import { ResultLabelsReport } from '@/components/reports/labels/ResultLabelsReport';
import { LabelModeHeader } from '@/components/reports/labels/LabelModeChrome';
import { useOfficialReportDownload } from './useOfficialReportDownload';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import type { ReportScope } from '@/lib/reports/types';
import { resolveReportScope } from '@/lib/reports/reportScope';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import type { PaperworkDescriptor } from '@/features/show-map/cockpit/paperworkPrintState';
import { recordPaperworkPrinted } from '@/features/show-map/cockpit/paperworkPrintActions';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReportDogOptions } from './useReportDogOptions';
import { useReportScopeOptions } from './useReportScopeOptions';
import { resolveInitialJudgeDay, useJudgeDayReportScope } from './useJudgeDayReportScope';
import type { ReportDbEntry } from '@/lib/reports/types';
import { useHostedReportData } from './useHostedReportData';
import { resolvePrintReadiness } from './reportReadinessCopy';
import { ReportPrintStatus } from './ReportPrintStatus';

const DEFAULT_REPORT_ID = 'check-in-sheet';

export interface InitialReportScope {
  trialId: string;
  classId: string;
  dogId: string;
}

function nonEmptyParam(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value ? value : undefined;
}

// Exported for unit testing — keeps the deep-link logic verifiable without
// asserting against shadcn SelectValue render internals.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialReportId(queryParam: string | null): string {
  if (!queryParam) return DEFAULT_REPORT_ID;
  const candidate = getReportById(queryParam);
  return candidate?.enabled ? queryParam : DEFAULT_REPORT_ID;
}

// eslint-disable-next-line react-refresh/only-export-components
export function resolveInitialReportScope(params: URLSearchParams): InitialReportScope {
  return {
    trialId: nonEmptyParam(params, 'trialId') ?? 'all',
    classId: nonEmptyParam(params, 'classId') ?? 'all',
    dogId: nonEmptyParam(params, 'dogId') ?? 'all',
  };
}

export default function ReportsPage() {
  const params = useParams<{ showId?: string; id?: string }>();
  const showId = params.showId ?? params.id;
  const { show: currentShow } = useFastShowDetails(showId);
  // Sections are ordered nearest-in-time first by the show's own phase; nothing is gated.
  const linkShowId = showId ?? currentShow?.id;
  const [searchParams] = useSearchParams();
  const [initialScope] = useState(() => resolveInitialReportScope(searchParams));
  // Resolve once on mount so subsequent ?report= changes don't fight the
  // user's manual dropdown selection.
  const [reportType, setReportType] = useState(() =>
    resolveInitialReportId(searchParams.get('report'))
  );
  const [trialId, setTrialId] = useState<string>(initialScope.trialId);
  const [classId, setClassId] = useState<string>(initialScope.classId);
  const [dogId, setDogId] = useState<string>(initialScope.dogId);
  const { user } = useAuthContext();
  const [armbandDescriptor, setArmbandDescriptor] = useState<PaperworkDescriptor | null>(null);
  const effectiveScope = useMemo<ReportScope>(
    () => resolveReportScope({ showId: showId ?? '', trialId, classId }),
    [showId, trialId, classId]
  );
  const report = getReportById(reportType);
  const [sortOrder, setSortOrder] = useState(report?.defaultSort ?? 'run-order');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { controlsRef, focusControls } = useFocusReportControls({
    focusOnMount: Boolean(getReportById(searchParams.get('report') ?? '')?.enabled),
  });

  const {
    show,
    trials,
    classes,
    entries,
    catalogProfilesReadComplete,
    dataState,
    isReady,
    isLoading,
    isError,
    refetch,
  } = useReportData({
    show: currentShow,
    trialId,
    classId,
  });
  // MYK9-280: the page owns the hosted fetch; MYK9-721: Print and the preview
  // gate on the same readiness for it as for the report rows.
  const reportClassIds = useMemo(
    () => (classes as Array<{ id: string }> | undefined)?.map(c => c.id),
    [classes]
  );
  const hosted = useHostedReportData({
    reportType,
    showId: show?.id,
    trialId: trialId !== 'all' ? trialId : undefined,
    dogId: dogId !== 'all' ? dogId : undefined,
    classIds: reportClassIds,
  });
  const printReadiness = resolvePrintReadiness(dataState, hosted.hostedState);
  // During a paused/loading or cold-replica report-trials query, retain the
  // show detail's already-loaded trials for timezone and registry scope. The
  // show detail and report query share the same show, so a non-empty detail row
  // is the only useful answer when the scoped query has no rows yet.
  const resolvedTrials = useMemo(
    () => trials ?? currentShow?.trials ?? [],
    [currentShow?.trials, trials]
  );
  const showTimeZone = getEntryWindowTimezone(
    resolvedTrials as Array<{
      id?: string | null;
      date?: string | null;
      timezone?: string | null;
    }>
  );
  const showTimePhase = resolveShowTimePhase(currentShow, new Date(), showTimeZone);

  const { trialOptions, classOptions } = useReportScopeOptions(resolvedTrials, classes);

  // MYK9-1036: one judge's day of the Result Catalog, a filter over this show-wide read.
  const [initialJudgeDay] = useState(() => resolveInitialJudgeDay(searchParams));
  const judgeDay = useJudgeDayReportScope({
    reportType,
    initial: initialJudgeDay,
    classes: classes as Array<{ id: string; trial_id?: string | null }> | undefined,
    entries: entries as ReportDbEntry[] | undefined,
    trials: resolvedTrials as Array<{ id: string; date?: string | null }>,
  });
  const { dogs: dogOptions, unavailable: dogOptionsUnavailable } = useReportDogOptions(
    showId,
    report?.supportsDogFilter ?? false
  );
  const handleReportTypeChange = (value: string) => {
    setReportType(value);
    const newReport = getReportById(value);
    setSortOrder(newReport?.defaultSort ?? 'run-order');
    if (!newReport?.scopes.includes(effectiveScope.kind)) {
      if (effectiveScope.kind === 'class' && newReport?.scopes.includes('trial')) {
        setClassId('all');
      } else {
        setTrialId('all');
        setClassId('all');
      }
    }
    setDogId('all');
  };

  const handleTrialChange = (value: string) => {
    judgeDay.clear();
    setTrialId(value);
    setDogId('all');
    setClassId('all');
  };

  // A judge's day spans trials, so it reads the whole show: it replaces the trial and class picks.
  const handleJudgeDayChange = (key: string) => {
    judgeDay.select(key);
    setTrialId('all');
    setClassId('all');
  };

  const setCurrentArmbandDescriptor = useCallback(
    (descriptor: PaperworkDescriptor | null) => setArmbandDescriptor(descriptor),
    []
  );

  const paperworkDescriptor = useMemo(() => {
    if (reportType === 'armband-labels') return armbandDescriptor;
    // A judge's day is not a show, trial or class scope: recording it printed would stamp the
    // whole show's catalog, so it is not tracked (MYK9-1036).
    if (judgeDay.isFiltering) return null;
    return buildReportPaperworkDescriptor({
      reportId: reportType,
      scope: effectiveScope,
      classes: (classes ?? []) as unknown as Parameters<
        typeof buildReportPaperworkDescriptor
      >[0]['classes'],
      entries: (entries ?? []) as unknown as Parameters<
        typeof buildReportPaperworkDescriptor
      >[0]['entries'],
    });
  }, [armbandDescriptor, reportType, effectiveScope, classes, entries, judgeDay.isFiltering]);
  const { printStatusUnavailable, printStatusChecking, printStatusKnown, printState, printChips } =
    useReportPrintStatus({
      showId: showId ?? '',
      reportType,
      dataState,
      paperworkDescriptor,
      armbandDescriptor,
      scope: effectiveScope,
      classes,
      entries,
      timeZone: showTimeZone,
    });

  const handlePrint = () => {
    // Check the DATA before the iframe. A paused query renders an empty report
    // whose iframe body is non-empty, so printIframe() happily returns true and
    // the secretary gets a roster with no dogs on it.
    //
    // Armband labels are exempt: ArmbandLabelsReport reads its own
    // `['armband-label-entries', showId]` query and never touches
    // trials/classes/entries, so gating it here would refuse to print a sheet
    // that is on screen and correct, citing data it does not use. Result labels
    // are NOT exempt -- they are handed trials/classes/entries as props.
    if (reportType !== 'armband-labels' && printReadiness.blockedMessage) {
      toast(printReadiness.blockedMessage);
      return;
    }
    if (!printIframe(iframeRef)) {
      toast('Still building the preview. It will be ready in a moment.');
      return;
    }
    // Offered, not demanded. window.print() reports nothing back -- not whether
    // a printer was chosen, not whether the secretary pressed Escape -- so a
    // modal raised here asks "Did the Check-in Sheet print correctly?" about
    // paper that may not exist, which is the confirmation-dialog-for-a-routine-
    // action that docs/INTENT.md names as a secretary anti-pattern. A toast
    // makes the same record available and costs nothing to ignore.
    //
    // The packet panel's "Mark printed" button still opens the dialog, and
    // should: there the secretary asked for it.
    if (paperworkDescriptor) {
      const descriptor = paperworkDescriptor;
      if (!printStatusKnown || !printState) {
        toast(
          printStatusUnavailable
            ? 'Print dialog opened. Reload before recording it printed because print status is unavailable.'
            : 'Print dialog opened. Wait for print status to finish loading before recording it printed.'
        );
        return;
      }
      // "Print dialog opened", not "Sent to your printer" -- the comment above
      // says window.print() reports nothing back, so claiming it printed would
      // assert the very thing that is unknowable.
      toast('Print dialog opened.', {
        action: {
          label: 'Mark printed',
          onClick: () => void confirmPrinted(descriptor),
        },
      });
    }
  };

  const confirmPrinted = async (descriptor: PaperworkDescriptor) => {
    if (!user || !printStatusKnown || !printState) {
      toast.error('Print status is unavailable. Reload before recording it printed.');
      return;
    }
    try {
      await recordPaperworkPrinted({
        descriptor,
        user,
        message: 'Marked as printed.',
        undoReason: 'Undid print confirmation',
        undoFailureMessage: 'Could not undo that. The packet is still marked printed.',
      });
    } catch {
      toast.error('Could not save that. Nothing was recorded, so try marking it printed again.');
    }
  };

  const officialPdfAction = useOfficialReportDownload({
    reportType,
    showId,
    currentShowName: currentShow?.name,
    show,
    trials,
    classes,
    entries,
    trialId,
    classId,
    dogId,
    sortOrder,
    isReady,
  });

  return (
    // px-4: this project's `.container` compiles to width + max-widths only,
    // with no horizontal padding, and nothing up the tree supplies any -- so at
    // 375px the heading and the packet card sat flush against both edges.
    <div className="container mx-auto flex flex-col px-4 py-6">
      <ShowDeskReturnLink showId={showId} className="mb-2 self-start" />
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Print check-in sheets, catalogs, official forms, and labels. Pick a report below, narrow
          it to a trial or class, then print or download.
        </p>
      </div>
      {linkShowId && (
        <p className="mb-6 text-sm text-muted-foreground">
          Need the emergency paper fallback?{' '}
          <Link
            to={`/shows/${linkShowId}?tool=emergency-trial-packet`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Open it in Show tools
          </Link>
          .
        </p>
      )}

      <ReportPhaseSections
        reportType={reportType}
        trialId={trialId}
        trials={trialOptions}
        showId={linkShowId}
        showPhase={showTimePhase}
        printChips={printChips}
        onReportTypeChange={value => {
          handleReportTypeChange(value);
          focusControls();
        }}
      />

      <ReportPrintStatus
        hasDescriptor={Boolean(paperworkDescriptor)}
        isChecking={printStatusChecking}
        isUnavailable={printStatusUnavailable}
        state={printState}
      />

      {/* Controls */}
      <div
        ref={controlsRef}
        tabIndex={-1}
        role="group"
        aria-label="Report controls"
        className="scroll-mt-4 focus:outline-none"
      >
        <ReportControlsBar
          reportType={reportType}
          trialId={trialId}
          classId={classId}
          dogId={dogId}
          sortOrder={sortOrder}
          trials={trialOptions}
          classes={classOptions}
          dogs={dogOptions}
          dogsUnavailable={dogOptionsUnavailable}
          onTrialChange={handleTrialChange}
          onClassChange={value => {
            judgeDay.clear();
            setClassId(value);
          }}
          onDogChange={setDogId}
          onSortChange={setSortOrder}
          onPrint={handlePrint}
          officialPdfAction={officialPdfAction}
          judgeDay={
            reportType === 'result-catalog'
              ? {
                  options: judgeDay.options,
                  value: judgeDay.value,
                  onChange: handleJudgeDayChange,
                }
              : undefined
          }
        />
      </div>

      {/* Preview — the report iframe is a fixed 8.5in (letter) page. On viewports
          narrower than that (tablet/phone) it must scroll horizontally inside this
          container rather than overflow the page and clip the report's left edge.
          `w-fit mx-auto` centers it when there's room and keeps the left edge
          reachable when it overflows (unlike `flex justify-center`). */}
      <div className="mt-6 overflow-x-auto">
        {reportType === 'armband-labels' ? (
          <div className="w-full">
            <LabelModeHeader
              title="Armband Labels"
              subtitle="Choose a label size, pick which armbands to print, then Print."
            />
            <ArmbandLabelsReport
              showId={showId}
              scope={effectiveScope}
              iframeRef={iframeRef}
              onDescriptorChange={setCurrentArmbandDescriptor}
            />
            <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
          </div>
        ) : reportType === 'result-labels' ? (
          <div className="w-full">
            <LabelModeHeader
              title="Result Labels"
              subtitle="Pick a trial and class, set the sort, then Print the result labels."
            />
            <ResultLabelsReport
              show={show}
              trials={trials as Parameters<typeof ResultLabelsReport>[0]['trials']}
              classes={classes as Parameters<typeof ResultLabelsReport>[0]['classes']}
              entries={entries as Parameters<typeof ResultLabelsReport>[0]['entries']}
              scope={effectiveScope}
              sortOrder={sortOrder}
              isLoading={isLoading}
              isUnavailable={dataState === 'unavailable'}
              isError={isError}
              iframeRef={iframeRef}
            />
            <iframe ref={iframeRef} title="Label Print" style={{ display: 'none' }} />
          </div>
        ) : (
          <div className="w-fit mx-auto">
            <ReportPreview
              reportType={reportType}
              show={show}
              trials={trials as Parameters<typeof ReportPreview>[0]['trials']}
              classes={
                (judgeDay.scoped?.classes ?? classes) as Parameters<
                  typeof ReportPreview
                >[0]['classes']
              }
              entries={
                (judgeDay.scoped?.entries ?? entries) as Parameters<
                  typeof ReportPreview
                >[0]['entries']
              }
              trialId={trialId}
              classId={classId}
              dogId={dogId}
              sortOrder={sortOrder}
              isLoading={isLoading}
              isError={isError}
              dataState={dataState}
              hosted={hosted}
              catalogProfilesReadComplete={catalogProfilesReadComplete}
              hasDownloadAction={Boolean(officialPdfAction)}
              downloadBlockedReason={
                officialPdfAction?.disabled ? officialPdfAction.disabledReason : undefined
              }
              onRetry={() => {
                refetch();
                hosted.refetch();
              }}
              iframeRef={iframeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
