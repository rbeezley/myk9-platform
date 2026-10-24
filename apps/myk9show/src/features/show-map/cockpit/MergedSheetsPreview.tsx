import { useEffect, useMemo, useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';

import { getReportById } from '@/lib/reports/reportRegistry';
import { buildPages } from '@/pages/secretary/ReportsPage/reportPreviewPages';
import type { ReportDataSet } from '@/lib/reports/types';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';

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
  onReadyChange,
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
  /**
   * True only while the frame holds the PDF built from the CURRENT inputs. The caller blocks Print
   * otherwise, so a stale merge can never print under the current sheets' fingerprints.
   */
  onReadyChange?: (ready: boolean) => void;
}) {
  // The build the failure belongs to, so a new build starts clean without resetting state in an effect.
  const [failedFor, setFailedFor] = useState<unknown>(null);
  // Bumped by Try again so the sheets are built afresh.
  const [attempt, setAttempt] = useState(0);
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
    // `attempt` is not read in the body; it forces a fresh build after Try again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, show, trialId, classId, trials, classes, entries, key, attempt]);

  useEffect(() => {
    const iframe = iframeRef.current;
    // The inputs changed: whatever the frame holds describes obsolete sheets. Empty it first.
    if (iframe?.getAttribute('src')?.startsWith('blob:')) iframe.src = 'about:blank';
    onReadyChange?.(false);
    if (!iframe || !parts || parts === 'error' || parts.some(part => part === null)) return;
    let url: string | null = null;
    // Set by the cleanup of this build, so an older merge resolving late is dropped.
    let superseded = false;
    // Dynamic on purpose: pdf-lib (fontkit) loads when sheets are merged, not with the show desk.
    import('./mergeReportPdfs')
      .then(({ mergeReportPdfs }) => mergeReportPdfs(parts as Uint8Array[]))
      .then(bytes => {
        if (superseded) return;
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        url = URL.createObjectURL(new Blob([copy.buffer], { type: 'application/pdf' }));
        iframe.src = url;
        onReadyChange?.(true);
      })
      .catch(() => {
        if (!superseded) setFailedFor(parts);
      });
    return () => {
      superseded = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [parts, iframeRef, onReadyChange]);
  const failed = parts === 'error' || (parts !== null && failedFor === parts);

  return (
    <div className="w-full">
      {failed && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          These sheets could not be combined. Try again, or print them one at a time.
          <Button
            type="button"
            variant="outline"
            className="ml-2 min-h-11"
            onClick={() => setAttempt(count => count + 1)}
          >
            Try again
          </Button>
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
