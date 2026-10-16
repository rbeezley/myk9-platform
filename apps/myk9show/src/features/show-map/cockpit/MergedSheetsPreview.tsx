import { useEffect, useMemo, useState, type RefObject } from 'react';

import { getReportById } from '@/lib/reports/reportRegistry';
import { buildPages } from '@/pages/secretary/ReportsPage/reportPreviewPages';
import type { ReportDataSet } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { mergeReportPdfs } from './mergeReportPdfs';

/** The sheets of `reportIds` that are not PDF-based and so cannot join a one-job batch. */
export function unmergeableReportIds(reportIds: readonly string[]): string[] {
  return reportIds.filter(id => !getReportById(id)?.buildPdf);
}

/**
 * One preview frame holding every ticked sheet as a single PDF, so the browser opens ONE print
 * dialog for the batch. Check-in and score sheets are PDF-based (`buildPdf`) and merge; a markup
 * report cannot, which the caller reports by name instead of printing it separately.
 */
export function MergedSheetsPreview({
  reportIds,
  show,
  trials,
  classes,
  entries,
  trialId,
  classId,
  ready,
  iframeRef,
}: {
  reportIds: readonly string[];
  show: Show | null | undefined;
  trials: unknown;
  classes: unknown;
  entries: unknown;
  trialId: string;
  classId: string;
  ready: boolean;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const [failed, setFailed] = useState(false);
  const key = reportIds.join('|');
  const parts = useMemo(() => {
    if (!ready || !show) return null;
    const pages = buildPages(
      trialId,
      classId,
      trials as DbTrial[],
      classes as DbClass[] | null | undefined,
      entries as DbEntry[] | null | undefined
    );
    if (pages.length === 0) return null;
    const dataSet: ReportDataSet = { show, pages };
    try {
      return key.split('|').map(id => {
        const report = getReportById(id);
        return report?.buildPdf?.(dataSet, report.defaultSort ?? 'run-order') ?? null;
      });
    } catch {
      return 'error' as const;
    }
  }, [ready, show, trialId, classId, trials, classes, entries, key]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !parts || parts === 'error' || parts.some(part => part === null)) return;
    let url: string | null = null;
    let cancelled = false;
    mergeReportPdfs(parts as Uint8Array[])
      .then(bytes => {
        if (cancelled) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }));
        iframe.src = url;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [parts, iframeRef]);

  return (
    <div className="w-full">
      {(failed || parts === 'error') && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          These sheets could not be combined. Print them one at a time.
        </p>
      )}
      <iframe
        ref={iframeRef}
        title="Selected sheets preview"
        className="h-[70vh] w-full rounded-md border bg-white"
      />
    </div>
  );
}
