import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { Button } from '@/components/ui/button';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';
import { getClassScoreAudits } from '@/services/database/entries/scoreAudit';

import { buildJudgeReviews, reviewSummary, type ReviewEntryInfo } from './judgeReview';
import { findScoreCorrections, type ScoreCorrection } from './judgeReviewCorrections';
import { useKeyedPdfs } from './useKeyedPdfs';
import { packetFileName, plural, savePacketPdf, usePacketFrame } from './usePacketFrame';

const ALL = 'all';
const NO_CORRECTIONS: ReadonlyMap<string, readonly ScoreCorrection[]> = new Map();

/**
 * The judge review packet (MYK9-1924 phase 2a): one results page per class for the judge to compare
 * with their scoresheets and initial, only that judge's classes, in the order they were judged.
 * The pages come from the Results rows, so they show exactly what Results shows. A score the
 * secretary changed after the judge submitted it is marked, from the score history. When the
 * history cannot be read the packet still prints, and a note says changed scores are not marked.
 */
export function JudgeReviewPanelBody({
  rows,
  entries,
  showName,
  timeZone,
  judgeKey,
}: {
  rows: readonly ResultsClassRow[];
  entries: readonly ReviewEntryInfo[];
  showName: string;
  timeZone: string;
  /** The judge the panel opened for, or null for every judge. */
  judgeKey: string | null;
}) {
  const classIds = useMemo(
    () => rows.filter(row => row.takesJudgeSignOff).map(row => row.id),
    [rows]
  );
  const audits = useQuery({
    queryKey: ['judge-review-audits', classIds],
    queryFn: () => getClassScoreAudits(classIds),
    enabled: classIds.length > 0,
    staleTime: 0,
    retry: false,
  });
  const correctionsByEntryId = useMemo(() => {
    if (!audits.data) return NO_CORRECTIONS;
    const found = new Map<string, readonly ScoreCorrection[]>();
    for (const [entryId, history] of audits.data) {
      const corrections = findScoreCorrections(history);
      if (corrections.length > 0) found.set(entryId, corrections);
    }
    return found;
  }, [audits.data]);
  // Wait for the history before building, so a printed packet never silently lacks its marks.
  const historySettled = audits.isSuccess || audits.isError || classIds.length === 0;
  const judges = useMemo(
    () =>
      historySettled ? buildJudgeReviews({ rows, entryInfo: entries, correctionsByEntryId }) : null,
    [historySettled, rows, entries, correctionsByEntryId]
  );
  const [attempt, setAttempt] = useState(0);
  const pdfs = useKeyedPdfs(judges, attempt, async () => {
    const { buildJudgeReviewPdf } = await import('./buildJudgeReviewPdf');
    return { build: judge => buildJudgeReviewPdf(judge, showName, timeZone) };
  });
  const [selected, setSelected] = useState<string>(judgeKey ?? ALL);
  const [printing, setPrinting] = useState(false);
  const judge = judges?.find(item => item.key === selected) ?? null;
  const bytes =
    pdfs.status === 'ready' ? (judge ? (pdfs.byKey.get(judge.key) ?? null) : pdfs.all) : null;
  const { frameRef, frameReady } = usePacketFrame(bytes);

  if (!judges)
    return <p className="p-4 text-sm text-muted-foreground">Getting the results ready…</p>;
  if (judges.length === 0) {
    return (
      <p className="p-4 text-sm">
        No judge has a finished class with results to review yet, so there is nothing to print.
      </p>
    );
  }
  const shown = judge ? [judge] : judges;
  const pageTotal = shown.reduce((sum, item) => sum + item.pageTotal + 1, 0);
  const notDone = shown.filter(item => !item.done);

  const print = async () => {
    if (!frameReady) return;
    setPrinting(true);
    try {
      const closed = await printIframeAndWait(frameRef);
      if (!closed) toast('The packet is still building. It will be ready in a moment.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-base">
        For <strong>{judge ? judge.judgeName : 'every judge'}</strong>, one results page per class,
        in the order they judged.
      </p>
      {audits.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>
            The score history could not be read, so scores changed after a judge submitted them are
            not marked. You can still print.
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => void audits.refetch()}
          >
            Try again
          </Button>
        </div>
      )}
      {notDone.length > 0 && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {notDone.map(item => item.judgeName).join(', ')} {notDone.length === 1 ? 'has' : 'have'}{' '}
          classes still running. Their pages will be incomplete.
        </p>
      )}
      {pdfs.status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>The packets could not be built.</span>
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
      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <ul aria-label="Packets" className="flex flex-col gap-2">
          {[null, ...judges].map(item => {
            const key = item?.key ?? ALL;
            const active = selected === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => setSelected(key)}
                  className={`min-h-11 w-full rounded-md border px-3 py-2 text-left text-sm ${active ? 'border-primary bg-primary/5' : ''}`}
                >
                  <span className="block font-medium">{item ? item.judgeName : 'Every judge'}</span>
                  <span className="block text-muted-foreground">
                    {item
                      ? reviewSummary(item).split(' · ').slice(1).join(' · ')
                      : `${plural(judges.length, 'judge', 'judges')} · ${plural(
                          judges.reduce((sum, entry) => sum + entry.pageTotal, 0),
                          'page',
                          'pages'
                        )} to initial`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <iframe
          ref={frameRef}
          title="Packet preview"
          className="h-[60vh] w-full rounded-md border bg-white"
        />
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {plural(shown.length, 'judge packet', 'judge packets')} ·{' '}
          {plural(pageTotal, 'sheet', 'sheets')}
        </span>
        <Button
          type="button"
          size="touch"
          disabled={printing || !frameReady}
          onClick={() => void print()}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing
            ? 'Printing…'
            : judge
              ? `Print ${judge.judgeName}'s results`
              : `Print all ${plural(judges.length, 'packet', 'packets')}`}
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
              packetFileName([showName, 'results to initial', judge?.judgeName ?? null])
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
