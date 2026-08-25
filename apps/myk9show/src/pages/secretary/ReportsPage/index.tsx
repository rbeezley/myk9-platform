import { useState, useRef, useMemo, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData, type ReportDataState } from '@/hooks/queries/useReportData';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportControlsBar } from './ReportControlsBar';
import { ReportPreview } from './ReportPreview';
import { printIframe } from './reportPreviewUtils';
import { ArmbandLabelsReport } from '@/components/reports/labels/ArmbandLabelsReport';
import { ResultLabelsReport } from '@/components/reports/labels/ResultLabelsReport';
import { LabelModeHeader } from '@/components/reports/labels/LabelModeChrome';
import { buildClassReportProps, buildTrialReportProps } from './reportDataMapping';
import { useAKCOfficialPdfAction } from './useAKCOfficialPdfAction';
import { ShowDeskReturnLink } from '@/features/show-map/cockpit/ShowDeskReturnLink';
import type { ReportScope } from '@/lib/reports/types';
import { resolveReportScope } from '@/lib/reports/reportScope';
import { buildReportPaperworkDescriptor } from '@/features/show-map/cockpit/buildReportPaperworkDescriptor';
import {
  derivePaperworkPrintState,
  type PaperworkDescriptor,
} from '@/features/show-map/cockpit/paperworkPrintState';
import { recordPaperworkPrinted } from '@/features/show-map/cockpit/paperworkPrintActions';
import { useShowPaperworkPrints } from '@/features/show-map/cockpit/useShowPaperworkPrints';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useReportDogOptions } from './useReportDogOptions';

const DEFAULT_REPORT_ID = 'check-in-sheet';

/**
 * What to say when Print is pressed on data that is not current. Each names the
 * situation and what will clear it, because "the report is still loading" was
 * wrong in three of these four cases.
 */
const PRINT_BLOCKED_MESSAGE: Record<ReportDataState, string> = {
  loading: 'Still loading this show. Print once the preview finishes.',
  unavailable:
    'No connection, so the entries could not be checked. Reconnect before printing, or the report may be missing dogs.',
  stale: 'Still loading the trial you just picked. Print once the preview catches up.',
  error: 'The entries could not be loaded. Use Try again below, then print.',
  ready: '',
};

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

  const { show, trials, classes, entries, dataState, isReady, isLoading, isError, refetch } =
    useReportData({
      show: currentShow,
      trialId,
      classId,
    });

  const trialOptions = useMemo(
    () =>
      ((trials ?? []) as Array<Record<string, unknown>>).map(t => ({
        id: t.id as string,
        name: (t.name ?? '') as string,
        trial_number: Number(t.trial_number ?? 0),
        date: (t.date ?? '') as string,
      })),
    [trials]
  );

  const classOptions = useMemo(
    () =>
      ((classes ?? []) as Array<Record<string, unknown>>).map(c => ({
        id: c.id as string,
        name: (c.name ?? '') as string,
        element: (c.element ?? '') as string,
        level: (c.level ?? '') as string,
        section: (c.section ?? '') as string,
        trial_id: (c.trial_id ?? '') as string,
      })),
    [classes]
  );

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
    setTrialId(value);
    setDogId('all');
    setClassId('all');
  };

  const setCurrentArmbandDescriptor = useCallback(
    (descriptor: PaperworkDescriptor | null) => setArmbandDescriptor(descriptor),
    []
  );

  const paperworkDescriptor = useMemo(() => {
    if (reportType === 'armband-labels') return armbandDescriptor;
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
  }, [armbandDescriptor, reportType, effectiveScope, classes, entries]);
  const paperworkPrints = useShowPaperworkPrints(showId ?? '');
  const printState = useMemo(
    () =>
      paperworkDescriptor && paperworkPrints.data
        ? derivePaperworkPrintState(paperworkPrints.data, paperworkDescriptor)
        : null,
    [paperworkDescriptor, paperworkPrints.data]
  );

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
    if (reportType !== 'armband-labels' && !isReady) {
      toast(PRINT_BLOCKED_MESSAGE[dataState]);
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
    if (!user) return;
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

  const officialPdfProps = useMemo(() => {
    if (!show || trialId === 'all') return null;
    return (
      buildTrialReportProps({
        show,
        trials: trials as Parameters<typeof buildTrialReportProps>[0]['trials'],
        classes: classes as Parameters<typeof buildTrialReportProps>[0]['classes'],
        entries: entries as Parameters<typeof buildTrialReportProps>[0]['entries'],
        scope:
          trialId === 'all'
            ? { kind: 'show', showId: show.id }
            : { kind: 'trial', showId: show.id, trialId },
        sortOrder,
      })[0] ?? null
    );
  }, [show, trials, classes, entries, trialId, sortOrder]);

  const officialClassPdfProps = useMemo(() => {
    if (!show || trialId === 'all' || classId === 'all') return null;
    return buildClassReportProps({
      show,
      trials: trials as Parameters<typeof buildClassReportProps>[0]['trials'],
      classes: classes as Parameters<typeof buildClassReportProps>[0]['classes'],
      entries: entries as Parameters<typeof buildClassReportProps>[0]['entries'],
      scope: { kind: 'class', showId: show.id, trialId, classId },
      sortOrder,
    });
  }, [show, trials, classes, entries, trialId, classId, sortOrder]);

  const officialPdfAction = useAKCOfficialPdfAction({
    reportType,
    showId,
    showName: show?.name,
    currentShowName: currentShow?.name,
    isDataReady: isReady,
    hasShow: Boolean(show),
    trialId,
    classId,
    dogId,
    officialPdfProps,
    officialClassPdfProps,
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
          Print check-in sheets, catalogs, official forms, and labels. Pick a report, narrow it to a
          trial or class, then print or download.
        </p>
      </div>
      {linkShowId && (
        <p className="mb-6 text-sm text-muted-foreground">
          Need the emergency paper fallback?{' '}
          <Link
            to={`/shows/${linkShowId}/show-desk?tool=emergency-trial-packet`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Open it in Show Desk tools
          </Link>
          .
        </p>
      )}

      {paperworkDescriptor && (
        <div
          className="mb-1 mt-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm"
          data-testid="report-print-status"
        >
          <div className="font-medium">
            {printState?.state === 'current'
              ? 'Printed'
              : printState?.state === 'stale'
                ? 'Stale'
                : 'Not confirmed printed'}
          </div>
          {printState?.record && (
            <div className="mt-1 text-muted-foreground">
              Printed by {printState.record.printedByName} on{' '}
              {new Date(printState.record.printedAt).toLocaleString()}
            </div>
          )}
          {printState?.state === 'stale' && (
            <div className="mt-1 text-muted-foreground">
              The report data changed after that print. Review and print the current version.
            </div>
          )}
        </div>
      )}

      {/* Controls */}
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
        onReportTypeChange={handleReportTypeChange}
        onTrialChange={handleTrialChange}
        onClassChange={setClassId}
        onDogChange={setDogId}
        onSortChange={setSortOrder}
        onPrint={handlePrint}
        officialPdfAction={officialPdfAction}
      />

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
              classes={classes as Parameters<typeof ReportPreview>[0]['classes']}
              entries={entries as Parameters<typeof ReportPreview>[0]['entries']}
              trialId={trialId}
              classId={classId}
              dogId={dogId}
              sortOrder={sortOrder}
              isLoading={isLoading}
              isError={isError}
              dataState={dataState}
              hasDownloadAction={Boolean(officialPdfAction)}
              downloadBlockedReason={
                officialPdfAction?.disabled ? officialPdfAction.disabledReason : undefined
              }
              onRetry={refetch}
              iframeRef={iframeRef}
            />
          </div>
        )}
      </div>
    </div>
  );
}
