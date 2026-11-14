import { useMemo, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { Button } from '@/components/ui/button';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';

import {
  buildJudgeRecords,
  judgeRecordReminder,
  judgeRecordSummary,
  type JudgeRecord,
} from './judgeRecord';
import type { ReviewEntryInfo } from './judgeReview';
import { useJudgeCorrections } from './useJudgeCorrections';
import { useKeyedPdfs } from './useKeyedPdfs';
import { packetFileName, plural, savePacketPdf, usePacketFrame } from './usePacketFrame';

/**
 * The judge's record (MYK9-1924 phase 2b): one judge, one day. Print it or save it as a
 * PDF to pass on. Nothing here blocks: a note sits beside a working button, and the record builds
 * offline (a score history that cannot be read only leaves the changed-score marks off).
 */
export function JudgeRecordPanelBody({
  rows,
  entries,
  showName,
  timeZone,
  judgeKey,
  day,
}: {
  rows: readonly ResultsClassRow[];
  entries: readonly ReviewEntryInfo[];
  showName: string;
  timeZone: string;
  judgeKey: string;
  day: string;
}) {
  const { audits, correctionsByEntryId, historySettled, historyUnavailable, historyPaused } =
    useJudgeCorrections(rows);
  const record = useMemo<JudgeRecord | null>(() => {
    if (!historySettled) return null;
    const records = buildJudgeRecords({ rows, entryInfo: entries, correctionsByEntryId });
    return records.find(item => item.judgeKey === judgeKey && item.day === day) ?? null;
  }, [historySettled, rows, entries, correctionsByEntryId, judgeKey, day]);
  const items = useMemo(() => (record ? [record] : null), [record]);

  const [attempt, setAttempt] = useState(0);
  const pdfs = useKeyedPdfs(items, attempt, async () => {
    const { buildJudgeRecordPdf } = await import('./buildJudgeRecordPdf');
    return { build: item => buildJudgeRecordPdf(item, showName, timeZone) };
  });
  const bytes = pdfs.status === 'ready' && record ? (pdfs.byKey.get(record.key) ?? null) : null;
  const { frameRef, frameReady } = usePacketFrame(bytes);

  const [printing, setPrinting] = useState(false);

  if (!record) {
    return historySettled ? (
      <p className="p-4 text-sm">There is nothing to print for this judge on this day.</p>
    ) : (
      <p className="p-4 text-sm text-muted-foreground">Getting the record ready…</p>
    );
  }

  const reminder = record.ready ? judgeRecordReminder(record.registryId) : null;

  const print = async () => {
    if (!frameReady) return;
    setPrinting(true);
    try {
      const closed = await printIframeAndWait(frameRef);
      if (!closed) toast('The record is still building. It will be ready in a moment.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-base">
        For{' '}
        <strong>
          {record.judgeName}, {record.dayLabel}
        </strong>
        : {judgeRecordSummary(record).split(' · ').slice(2).join(' · ')}, each trial on its own
        pages.
      </p>
      {reminder && (
        <p
          role="note"
          className="rounded-md border border-primary bg-primary/5 px-3 py-2 text-sm font-medium"
        >
          {reminder}
        </p>
      )}
      {!record.ready && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Not every class of {record.judgeName}&apos;s day is{' '}
          {record.registryId === 'AKC' ? 'initialled' : 'signed'} yet. This record shows what is
          finished so far.
        </p>
      )}
      {historyUnavailable && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>
            {historyPaused
              ? 'You are offline, so the score history is not available.'
              : 'The score history could not be read.'}{' '}
            Scores changed after the judge submitted them are not marked. You can still print.
          </span>
          {!historyPaused && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void audits.refetch()}
            >
              Try again
            </Button>
          )}
        </div>
      )}
      {pdfs.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>The record could not be built.</span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => setAttempt(count => count + 1)}
          >
            Try again
          </Button>
        </div>
      )}
      <iframe
        ref={frameRef}
        title="Packet preview"
        className="h-[60vh] w-full rounded-md border bg-white"
      />
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {plural(record.classCount, 'class', 'classes')} ·{' '}
          {plural(record.pageCount, 'results page', 'results pages')}
        </span>
        <Button
          type="button"
          size="touch"
          disabled={printing || !frameReady}
          onClick={() => void print()}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing ? 'Printing…' : `Print ${record.judgeName}'s record`}
        </Button>
        <Button
          type="button"
          size="touch"
          variant="outline"
          disabled={!bytes}
          onClick={() =>
            bytes &&
            savePacketPdf(
              bytes,
              packetFileName([showName, "judge's record", record.judgeName, day])
            )
          }
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Save as PDF
        </Button>
      </div>
    </div>
  );
}
