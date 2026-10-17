import { createRef, useEffect, useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';

import { SlideOverPanel } from '@/components/panels';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData } from '@/hooks/queries/useReportData';
import { resolveReportScope } from '@/lib/reports/reportScope';
import { getReportById } from '@/lib/reports/reportRegistry';
import { ReportPreviewBody } from '@/pages/secretary/ReportsPage/ReportPreviewBody';
import {
  blockedPrintMessage,
  resolvePrintReadiness,
} from '@/pages/secretary/ReportsPage/reportReadinessCopy';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';
import { NO_HOSTED_REPORT_DATA } from '@/pages/secretary/ReportsPage/useHostedReportData';
import { MergedSheetsPreview, unmergeableReportIds } from './MergedSheetsPreview';
import { buildReportPaperworkDescriptor } from './buildReportPaperworkDescriptor';
import { recordPaperworkPrinted } from './paperworkPrintActions';
import type { PaperworkDescriptor } from './paperworkPrintState';
import type { SecretaryCockpitPaperwork } from './secretaryCockpitTypes';

/**
 * The Overview's print preview: the same report frames Reports renders, in a side panel, so a
 * secretary never leaves the Overview to print a class's paperwork.
 *
 * One sheet previews as itself. Several sheets merge into ONE PDF and ONE preview, so the browser
 * opens a single print dialog for the batch. Every sheet is recorded printed when that dialog
 * CLOSES (`afterprint`, or print() returning, or focus coming back), through the same writer Reports uses, so the row on the Overview
 * and the Reports tab read one record. What is recorded is fingerprinted from the very rows the
 * preview rendered (never from the Overview's own map, which can be newer than the PDF), and the
 * panel re-reads the class when it opens so a cached preview cannot outlive a run-order change. A cancelled dialog fires the same event; the record shows
 * on the row with an Undo, which is why no "did it print?" question is asked.
 */
export function ClassPrintPanel({
  open,
  showId,
  trialId,
  classId,
  classLabel,
  items,
  onClose,
}: {
  open: boolean;
  showId: string;
  trialId: string;
  classId: string;
  classLabel: string;
  items: readonly SecretaryCockpitPaperwork[];
  onClose: () => void;
}) {
  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={items.length === 1 ? `Print ${items[0]?.label ?? 'sheet'}` : 'Print selected sheets'}
      subtitle={classLabel}
      size="xl"
      className="md:max-w-4xl"
    >
      {open && (
        <ClassPrintPanelBody
          showId={showId}
          trialId={trialId}
          classId={classId}
          items={items}
          onDone={onClose}
        />
      )}
    </SlideOverPanel>
  );
}

function ClassPrintPanelBody({
  showId,
  trialId,
  classId,
  items,
  onDone,
}: {
  showId: string;
  trialId: string;
  classId: string;
  items: readonly SecretaryCockpitPaperwork[];
  onDone: () => void;
}) {
  const { user } = useAuthContext();
  const { show: currentShow } = useFastShowDetails(showId);
  const [printing, setPrinting] = useState(false);
  const scope = useMemo(
    () => resolveReportScope({ showId, trialId, classId }),
    [showId, trialId, classId]
  );
  const {
    show,
    trials,
    classes,
    entries,
    catalogProfilesReadComplete,
    dataState,
    isLoading,
    isError,
    refetch,
  } = useReportData({ show: currentShow, trialId, classId });
  const frames = useMemo(
    () => new Map(items.map(item => [item.reportId, createRef<HTMLIFrameElement>()] as const)),
    [items]
  );
  const readiness = resolvePrintReadiness(dataState, 'ready');
  // Armband labels read their own query, so unrelated report reads never block them (as in Reports).
  const blockedMessage = items.every(item => blockedPrintMessage(item.reportId, readiness) === null)
    ? null
    : readiness.blockedMessage;
  // The rows the preview renders are the rows the record is fingerprinted from.
  const describe = (reportId: string): PaperworkDescriptor | null =>
    buildReportPaperworkDescriptor({
      reportId,
      scope,
      classes: (classes ?? []) as unknown as Parameters<
        typeof buildReportPaperworkDescriptor
      >[0]['classes'],
      entries: (entries ?? []) as unknown as Parameters<
        typeof buildReportPaperworkDescriptor
      >[0]['entries'],
    });
  // A freshly opened panel never prints cached rows: the class's report data is re-read on open
  // (a run-order change does not invalidate the cached `['reports', ...]` entries).
  useEffect(() => {
    refetch();
    // Once per open; `refetch` is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const unrecordable =
    readiness.state === 'ready'
      ? items.filter(item => item.reportId !== 'armband-labels' && !describe(item.reportId))
      : [];

  const resolvedTrials = trials ?? currentShow?.trials ?? [];
  const batch = items.length > 1;
  const mergedFrame = useRef<HTMLIFrameElement>(null);
  const [mergedReady, setMergedReady] = useState(false);
  // What the armband preview is showing now: a picked armband or a filter changes which labels
  // print, so that, not the full-class confirmation, is what gets recorded (as in Reports).
  const [armbandDescriptor, setArmbandDescriptor] = useState<PaperworkDescriptor | null>(null);
  const cannotMerge = batch ? unmergeableReportIds(items.map(item => item.reportId)) : [];
  const labelOf = (id: string) => items.find(item => item.reportId === id)?.label ?? id;

  const record = async (item: SecretaryCockpitPaperwork) => {
    if (!user) return;
    const descriptor =
      item.reportId === 'armband-labels' ? armbandDescriptor : describe(item.reportId);
    // No descriptor means the preview has not said what it shows (armbands) or the sheet has no
    // fingerprint: record nothing rather than claim paper that was not printed.
    if (!descriptor) return;
    try {
      await recordPaperworkPrinted({
        descriptor,
        user,
        undoReason: 'Undid print record',
        undoFailureMessage: 'Could not undo that. The sheet is still marked printed.',
      });
    } catch {
      toast.error(`${item.label} could not be recorded as printed. Try Print again.`);
    }
  };

  const printAll = async () => {
    if (blockedMessage) {
      toast(blockedMessage);
      return;
    }
    // One print job: the merged frame for a batch, the sheet's own frame for a single sheet.
    const frame = batch ? mergedFrame : frames.get(items[0]?.reportId ?? '');
    if (!frame) return;
    setPrinting(true);
    try {
      const closed = await printIframeAndWait(frame);
      if (!closed) {
        toast('The sheets are still building. They will be ready in a moment.');
        return;
      }
      for (const item of items) await record(item);
    } finally {
      setPrinting(false);
    }
    onDone();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {unrecordable.length > 0 && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Print history is not available right now, so{' '}
          {unrecordable.map(item => item.label).join(', ')} will print without being recorded as
          printed.
        </p>
      )}
      {cannotMerge.length > 0 && (
        <p
          role="alert"
          className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm"
        >
          {cannotMerge.map(labelOf).join(', ')} cannot be printed together with the other sheets.
          Untick it and print it on its own.
        </p>
      )}
      {batch && cannotMerge.length === 0 && blockedMessage && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <span>{blockedMessage}</span>
          {(readiness.state === 'error' || readiness.state === 'unavailable') && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => refetch()}>
              Try again
            </Button>
          )}
        </div>
      )}
      {batch && cannotMerge.length === 0 && (
        <section aria-label="Selected sheets preview">
          <h3 className="mb-2 text-sm font-semibold">
            {items.map(item => item.label).join(' + ')}
          </h3>
          <MergedSheetsPreview
            reportIds={items.map(item => item.reportId)}
            show={show}
            trials={resolvedTrials}
            classes={classes}
            entries={entries}
            trialId={trialId}
            classId={classId}
            ready={!blockedMessage}
            onReadyChange={setMergedReady}
            iframeRef={mergedFrame}
          />
        </section>
      )}
      {!batch &&
        items.map(item => (
          <section key={item.reportId} aria-label={`${item.label} preview`}>
            <div className="overflow-x-auto">
              <ReportPreviewBody
                reportType={item.reportId}
                showId={showId}
                scope={scope}
                show={show}
                trials={resolvedTrials}
                classes={classes}
                entries={entries}
                trialId={trialId}
                classId={classId}
                dogId="all"
                sortOrder={getReportById(item.reportId)?.defaultSort ?? 'run-order'}
                isLoading={isLoading}
                isError={isError}
                dataState={dataState}
                hosted={NO_HOSTED_REPORT_DATA}
                catalogProfilesReadComplete={catalogProfilesReadComplete}
                hasDownloadAction={false}
                downloadBlockedReason={undefined}
                onRetry={() => refetch()}
                iframeRef={frames.get(item.reportId)!}
                onArmbandDescriptorChange={setArmbandDescriptor}
              />
            </div>
          </section>
        ))}
      <div className="sticky bottom-0 -mx-4 border-t bg-card px-4 py-3">
        <Button
          type="button"
          size="touch"
          className="w-full sm:w-auto"
          disabled={
            printing || items.length === 0 || cannotMerge.length > 0 || (batch && !mergedReady)
          }
          onClick={() => void printAll()}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing ? 'Printing…' : items.length === 1 ? 'Print' : `Print ${items.length} sheets`}
        </Button>
      </div>
    </div>
  );
}
