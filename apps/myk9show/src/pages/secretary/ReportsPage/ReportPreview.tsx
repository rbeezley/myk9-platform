import React, { useRef, useEffect, useMemo, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import { Button } from '@/components/ui/button';
import { renderReportToHtml } from '@/lib/reports/reportRenderer';
import { getReportById } from '@/lib/reports/reportRegistry';
import type { ReportDataSet, ReportProps } from '@/lib/reports/types';
import type { DbTrial, DbClass, DbEntry } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { formatShowDateRange } from '@/lib/format/dates';
import { buildTrialReportProps, mapReportEntries, mapReportTrialFields } from './reportDataMapping';
import { getReportRenderingMode } from './reportRenderingMode';
import type { ReportDataState } from '@/hooks/queries/useReportData';
import { resolveClassJudgeName, resolveTrialJudgeName } from '@/utils/classJudgeDisplay';

export interface ReportPreviewProps {
  reportType: string;
  show: Show | null | undefined;
  trials: DbTrial[] | null | undefined;
  classes: DbClass[] | null | undefined;
  entries: DbEntry[] | null | undefined;
  trialId: string;
  classId: string;
  dogId: string;
  sortOrder: string;
  isLoading: boolean;
  isError: boolean;
  /**
   * Why this is needed alongside isLoading/isError: `unavailable` is the state
   * where the app never got to ask. Without it the empty-entry branch below
   * reports "No entries found for this selection" — a claim about the class —
   * when the truth is a claim about the network.
   */
  dataState: ReportDataState;
  /**
   * Whether a download button EXISTS for this report and trial, regardless of
   * whether it is currently pressable.
   *
   * This must not be `!disabled`. `disabled` is true for several unrelated
   * reasons -- no trial picked yet (the default), a dog list still loading,
   * data not current -- and only ONE of them is a registry mismatch. Keying the
   * "this form does not match the registry" copy off `disabled` printed that
   * claim on first load for all eleven download-only reports, contradicting the
   * "Pick a trial above" line in the controls bar three inches higher. A true
   * registry mismatch is distinguishable: the hook returns no action at all.
   */
  hasDownloadAction?: boolean;
  /** Why the download is not pressable yet, when one exists. */
  downloadBlockedReason?: string | undefined;
  onRetry?: () => void;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
}

interface PageData {
  trial: DbTrial;
  classData: DbClass;
  entries: DbEntry[];
}

function buildPages(
  trialId: string,
  classId: string,
  trials: DbTrial[] | null | undefined,
  classes: DbClass[] | null | undefined,
  entries: DbEntry[] | null | undefined
): PageData[] {
  if (!trials || !classes || !entries) return [];

  const isAll = trialId === 'all' || classId === 'all';

  // Pre-index entries by class_id for O(1) lookups
  const entriesByClass = new Map<string, DbEntry[]>();
  for (const e of entries) {
    const key = e.class_id ?? '';
    if (!entriesByClass.has(key)) entriesByClass.set(key, []);
    entriesByClass.get(key)!.push(e);
  }

  if (isAll) {
    const pages: PageData[] = [];
    for (const trial of trials) {
      const trialClasses = classes.filter(c => c.trial_id === trial.id);
      for (const classData of trialClasses) {
        const classEntries = entriesByClass.get(classData.id) ?? [];
        pages.push({ trial, classData, entries: classEntries });
      }
    }
    return pages;
  }

  const trial = trials.find(t => t.id === trialId);
  const classData = classes.find(c => c.id === classId);
  if (!trial || !classData) return [];

  const classEntries = entriesByClass.get(classId) ?? [];
  return [{ trial, classData, entries: classEntries }];
}

export function ReportPreview({
  reportType,
  show,
  trials,
  classes,
  entries,
  trialId,
  classId,
  dogId,
  sortOrder,
  isLoading,
  isError,
  dataState,
  hasDownloadAction = false,
  downloadBlockedReason,
  onRetry,
  iframeRef: externalIframeRef,
}: ReportPreviewProps) {
  const internalIframeRef = useRef<HTMLIFrameElement>(null);
  const iframeRef = externalIframeRef ?? internalIframeRef;
  const report = getReportById(reportType);
  const [pdfRetryKey, setPdfRetryKey] = useState(0);

  // The check-in sheet and scoresheet render from the shared trial-packet PDF
  // renderer (`report.buildPdf`) instead of a React component, so the paper
  // is byte-identical to the emergency packet's. Built the same way as the
  // `pages` used below for the ordinary class-mode markup path.
  const pdfDataSet = useMemo<ReportDataSet | null>(() => {
    if (!report?.buildPdf || !show || isLoading || isError) return null;
    const pages = buildPages(trialId, classId, trials, classes, entries);
    if (pages.length === 0) return null;
    return { show, pages };
  }, [report, show, isLoading, isError, trialId, classId, trials, classes, entries]);

  // Built once per selection (memoized), not on every render — a multi-page
  // jsPDF render is synchronous and would otherwise jank the page. A throw
  // from the renderer is caught here so it can be shown inline with a retry,
  // never left to blank the pane or bubble to an error boundary.
  const pdfResult = useMemo(() => {
    if (!pdfDataSet || !report?.buildPdf) return null;
    try {
      return { bytes: report.buildPdf(pdfDataSet, sortOrder), error: null } as const;
    } catch (error) {
      return {
        bytes: null,
        error: error instanceof Error ? error.message : 'Could not build the PDF.',
      } as const;
    }
    // `pdfRetryKey` is not read in the body — it exists only to force this
    // memo to re-run when the Try Again button bumps it, since nothing else
    // about the selection changed after a transient renderer failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDataSet, report, sortOrder, pdfRetryKey]);

  // Renders the built PDF into the same iframe the markup path uses. Revokes
  // the previous object URL on every change and on unmount so a re-render
  // (new trial/class/sort selection) doesn't leak a blob.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !pdfResult?.bytes) return;
    // `Uint8Array.buffer` types as `ArrayBufferLike` (it could back onto a
    // `SharedArrayBuffer`), which `BlobPart` rejects — copy into a
    // known-plain `ArrayBuffer` first, same pattern as
    // `deliverEmergencyTrialPacket.ts`'s `bytesToBlob`.
    const copy = new Uint8Array(pdfResult.bytes.byteLength);
    copy.set(pdfResult.bytes);
    const blob = new Blob([copy.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    iframe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [pdfResult, iframeRef]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (isLoading || isError || !show) return;
    if (!report) return;
    // Rendered by the PDF pipeline above instead — never build markup for it.
    if (report.buildPdf) return;

    const renderingMode = getReportRenderingMode(report);

    let combinedMarkup: string;

    if (renderingMode === 'show') {
      // Filter to selected trial when a specific trial is chosen
      const targetTrialIds = trialId === 'all' ? (trials ?? []).map(t => t.id) : [trialId];
      const shouldFilterClass = report.scopes.includes('class') && classId !== 'all';

      const filteredClasses = (classes ?? []).filter(
        c => targetTrialIds.includes(c.trial_id ?? '') && (!shouldFilterClass || c.id === classId)
      );
      const filteredClassIds = new Set(filteredClasses.map(c => c.id));

      // Build enriched entries with class and trial metadata attached to each entry
      const allEntriesEnriched = (entries ?? [])
        .filter(e => filteredClassIds.has(e.class_id ?? ''))
        .map(e => {
          const cls = filteredClasses.find(c => c.id === e.class_id);
          const trial = (trials ?? []).find(t => t.id === cls?.trial_id);
          return mapReportEntries([e], trial, cls, show.assignedJudges ?? [])[0];
        });

      const allTrials = (trials ?? [])
        .filter(t => targetTrialIds.includes(t.id))
        .map(t => ({
          id: t.id,
          ...mapReportTrialFields(t),
          judgeName: resolveTrialJudgeName(
            filteredClasses.filter(c => c.trial_id === t.id),
            show.assignedJudges ?? []
          ),
        }));

      const allClasses = filteredClasses.map(c => ({
        id: c.id,
        trialId: c.trial_id ?? '',
        element: c.element ?? '',
        level: c.level ?? '',
        section: c.section ?? '',
        judgeName: resolveClassJudgeName(c, show.assignedJudges ?? []),
      }));

      const showDates = formatShowDateRange(show.startDate, show.endDate) || undefined;

      const props: ReportProps = {
        showId: show.id,
        showName: show.name ?? '',
        entries: allEntriesEnriched,
        sortOrder,
        allTrials,
        allClasses,
        organization: show.organization ?? undefined,
        clubName: show.clubName ?? undefined,
        ...(showDates ? { showDates } : {}),
        ...(dogId !== 'all' ? { dogId } : {}),
        ...(trialId !== 'all' ? { trialId } : {}),
      };
      const ReportComponent = report.component;
      combinedMarkup = ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
    } else if (renderingMode === 'trial') {
      // One render call per trial — all that trial's entries combined
      const targetTrials =
        trialId === 'all' ? (trials ?? []) : (trials ?? []).filter(t => t.id === trialId);

      combinedMarkup = buildTrialReportProps({
        show,
        trials: targetTrials,
        classes,
        entries,
        scope: { kind: 'show', showId: show.id },
        sortOrder,
      })
        .map(props => {
          const ReportComponent = report.component;
          return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
        })
        .join('');
    } else {
      // Existing class-mode rendering (unchanged)
      const pages = buildPages(trialId, classId, trials, classes, entries);
      if (pages.length === 0) return;

      const ReportComponent = report.component;
      combinedMarkup = pages
        .map(({ trial, classData, entries: pageEntries }) => {
          const props: ReportProps = {
            showId: show.id,
            showName: show.name ?? '',
            trial: {
              ...mapReportTrialFields(trial),
              judgeName: resolveClassJudgeName(classData, show.assignedJudges ?? []),
            },
            classData: {
              element: classData.element ?? '',
              level: classData.level ?? '',
              section: classData.section ?? '',
              timeLimitSeconds: classData.time_limit_seconds,
              areaCount: classData.num_areas,
              hidesText: classData.num_hides ? String(classData.num_hides) : null,
              distractionsText: classData.distraction_count
                ? String(classData.distraction_count)
                : null,
            },
            entries: mapReportEntries(pageEntries, trial, classData, show.assignedJudges ?? []),
            sortOrder,
            organization: show.organization ?? undefined,
            ...(dogId !== 'all' ? { dogId } : {}),
          };
          return ReactDOMServer.renderToStaticMarkup(<ReportComponent {...props} />);
        })
        .join('');
    }

    const html = renderReportToHtml(combinedMarkup);

    iframe.contentDocument?.open();
    iframe.contentDocument?.write(html);
    iframe.contentDocument?.close();

    const timerId = setTimeout(() => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px';
      }
    }, 100);

    return () => clearTimeout(timerId);
  }, [
    reportType,
    report,
    show,
    trials,
    classes,
    entries,
    trialId,
    classId,
    dogId,
    sortOrder,
    isLoading,
    isError,
    iframeRef,
  ]);

  // Checked FIRST. With no show there is no showId, so the trials query is
  // `enabled: false` and reports isPending forever -- which reads as 'loading'
  // and would leave the page spinning indefinitely with no error and no retry.
  // No show is a settled answer, not a pending one.
  if (!show) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center p-8 text-center text-muted-foreground"
      >
        {/* Not "Select a show": the route already carries the show id and this
            page has no show picker, so that instruction named an action the
            secretary had no way to take. */}
        This show could not be loaded, so there is nothing to build a report from.
      </div>
    );
  }

  if (dataState === 'unavailable') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-3 p-8 text-center"
      >
        <p className="font-medium">This show's entries could not be checked.</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          There is no connection right now, so the app has not been able to ask how many dogs are
          entered. That is different from the class being empty. Reconnect and this will fill in.
        </p>
        {onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center p-8 text-muted-foreground"
      >
        Loading report data…
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="status"
        aria-live="assertive"
        className="flex flex-col items-center justify-center gap-3 p-8 text-center text-destructive"
      >
        <p>We could not load the report data.</p>
        {onRetry && (
          <Button type="button" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const report = getReportById(reportType);

  // Registry forms with no HTML rendering. Say so, rather than leaving a blank
  // page that reads as "still loading" and a Print button that produces blank
  // paper. The Download button in the controls bar above is the real action.
  if (report?.pdfOnly) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center gap-2 p-8 text-center"
      >
        <p className="font-medium">{report.name} is a downloadable form.</p>
        <p className="max-w-prose text-sm text-muted-foreground">
          {!hasDownloadAction
            ? 'This form belongs to a different registry than the trial you have selected, so there is nothing to download. Pick the trial it belongs to, or choose a different form.'
            : downloadBlockedReason
              ? `There is no on-screen preview for this one; it downloads as a filled PDF. ${downloadBlockedReason}`
              : 'There is no on-screen preview for this one. Use the download button above to get the registry’s own form with your trial’s details already filled in, then print it from your PDF reader.'}
        </p>
      </div>
    );
  }

  const renderingMode = report ? getReportRenderingMode(report) : 'class';

  // class-mode pages only — show-mode and trial-mode don't use buildPages
  const pages =
    renderingMode === 'class' ? buildPages(trialId, classId, trials, classes, entries) : [];

  const hasEntries =
    renderingMode === 'show'
      ? (() => {
          const targetIds = trialId === 'all' ? (trials ?? []).map(t => t.id) : [trialId];
          const shouldFilterClass = report?.scopes.includes('class') && classId !== 'all';
          const classIds = new Set(
            (classes ?? [])
              .filter(
                c =>
                  targetIds.includes(c.trial_id ?? '') && (!shouldFilterClass || c.id === classId)
              )
              .map(c => c.id)
          );
          return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
        })()
      : renderingMode === 'trial'
        ? (() => {
            const targetTrials =
              trialId === 'all' ? (trials ?? []) : (trials ?? []).filter(t => t.id === trialId);
            const classIds = new Set(
              (classes ?? [])
                .filter(c => targetTrials.some(t => t.id === c.trial_id))
                .map(c => c.id)
            );
            return (entries ?? []).some(e => classIds.has(e.class_id ?? ''));
          })()
        : pages.some(p => p.entries.length > 0);

  if (!isLoading && !hasEntries) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center p-8 text-muted-foreground"
      >
        No entries found for this selection
      </div>
    );
  }

  if (report?.buildPdf && pdfResult?.error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center justify-center gap-3 p-8 text-center text-destructive"
      >
        <p>This report could not be generated: {pdfResult.error}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPdfRetryKey(key => key + 1)}
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div
      className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted p-2"
      aria-label="Report preview scroll area"
      role="region"
      tabIndex={0}
    >
      <div className="min-w-[8.5in]">
        <iframe
          ref={iframeRef}
          title="Report Preview"
          className="bg-white shadow-lg"
          style={{ width: '8.5in', minHeight: '11in', border: 'none' }}
        />
      </div>
    </div>
  );
}
