import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

import { SlideOverPanel } from '@/components/panels';
import { Button } from '@/components/ui/button';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useFastShowDetails } from '@/hooks/useFastShowDetails';
import { useReportData } from '@/hooks/queries/useReportData';
import { resolvePrintReadiness } from '@/pages/secretary/ReportsPage/reportReadinessCopy';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';

import { voidPaperworkPrint } from '../paperworkPrintActions';
import { AfterShowPanelBody } from './AfterShowPanelBody';
import { JudgeRecordPanelBody } from './JudgeRecordPanelBody';
import { JudgeReviewPanelBody } from './JudgeReviewPanelBody';
import type { ReviewEntryInfo } from './judgeReview';
import { collateTrialPacket } from './collateTrialPacket';
import { formatCoverDate } from './judgeCoverSheet';
import { recordTrialPacketPrint, type TrialPacketPrintRecords } from './recordTrialPacketPrint';
import { packetFileName, plural, savePacketPdf, usePacketFrame } from './usePacketFrame';
import { useTrialPacketPdfs } from './useTrialPacketPdfs';

const ALL = 'all';

/** What the judge review packet needs from Results: its rows, the entries behind them, the clock. */
export interface JudgeReviewSource {
  rows: readonly ResultsClassRow[];
  entries: readonly ReviewEntryInfo[];
  showName: string;
  timeZone: string;
  /** The judge the panel opened for, or null for every judge. */
  judgeKey: string | null;
}

/** The judge's record: one judge on one day, from the same Results rows. */
export interface JudgeRecordSource extends Omit<JudgeReviewSource, 'judgeKey'> {
  judgeKey: string;
  /** The trial day, `YYYY-MM-DD`. */
  day: string;
}

export type TrialPacketPanelProps = { open: boolean; showId: string; onClose: () => void } & (
  | { mode?: 'before-trial'; trialId: string }
  | { mode: 'after-show'; trialId: string }
  | { mode: 'judge-review'; review: JudgeReviewSource }
  | { mode: 'judge-record'; record: JudgeRecordSource }
);

const PANEL_TITLES = {
  'before-trial': 'Print before-trial packet',
  'after-show': 'Print after-show packet',
  'judge-review': 'Print results for initials',
  'judge-record': "Judge's record",
} as const;

/**
 * The Show Desk "Print paperwork" panel at trial scope (MYK9-1924 phase 1): one packet per judge,
 * each a cover sheet and then, class by class, the check-in sheet and the scoresheets. The same
 * check-in and score sheet renderers, and the same per-class print records, as printing one class.
 * Phase 2a opens the same panel from Results for the judge review packet and the after-show packet.
 * Nothing here blocks: a note sits beside a working Print button.
 */
export function TrialPacketPanel(props: TrialPacketPanelProps) {
  const { open, showId, onClose } = props;
  const mode = props.mode ?? 'before-trial';
  // At the app root for the same reason ClassPrintPanel is: a sticky ancestor is its own stacking context.
  return createPortal(
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={PANEL_TITLES[mode]}
      size="xl"
      className="md:max-w-4xl"
    >
      {open && props.mode === 'judge-review' && <JudgeReviewPanelBody {...props.review} />}
      {open && props.mode === 'judge-record' && <JudgeRecordPanelBody {...props.record} />}
      {open && props.mode === 'after-show' && (
        <AfterShowPanelBody showId={showId} trialId={props.trialId} />
      )}
      {open &&
        props.mode !== 'judge-review' &&
        props.mode !== 'judge-record' &&
        props.mode !== 'after-show' && <TrialPacketBody showId={showId} trialId={props.trialId} />}
    </SlideOverPanel>,
    document.getElementById('root') ?? document.body
  );
}

function TrialPacketBody({ showId, trialId }: { showId: string; trialId: string }) {
  const { user } = useAuthContext();
  const { show: currentShow } = useFastShowDetails(showId);
  const { show, trials, classes, entries, dataState, refetch } = useReportData({
    show: currentShow,
    trialId,
    classId: 'all',
  });
  const readiness = resolvePrintReadiness(dataState, 'ready');
  // A freshly opened panel never prints cached rows: a run-order change does not invalidate them.
  useEffect(() => {
    void refetch();
    // Once per open; `refetch` is a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packet = useMemo(
    () =>
      readiness.state === 'ready' && show
        ? collateTrialPacket({
            show,
            trials: (trials ?? []) as DbTrial[],
            classes: (classes ?? []) as DbClass[],
            entries: (entries ?? []) as DbEntry[],
            trialId,
          })
        : null,
    [readiness.state, show, trials, classes, entries, trialId]
  );
  const [attempt, setAttempt] = useState(0);
  const pdfs = useTrialPacketPdfs(packet, show?.name ?? '', attempt);
  const [selected, setSelected] = useState<string>(ALL);
  const [printing, setPrinting] = useState(false);
  const [printed, setPrinted] = useState<(TrialPacketPrintRecords & { label: string }) | null>(
    null
  );

  const judge = packet?.judges.find(item => item.key === selected) ?? null;
  const bytes =
    pdfs.status === 'ready' ? (judge ? (pdfs.byJudgeKey.get(judge.key) ?? null) : pdfs.all) : null;
  const printedJudges = judge ? [judge] : (packet?.judges ?? []);

  const { frameRef, frameReady } = usePacketFrame(bytes);

  const sheetTotal = printedJudges.reduce((sum, item) => sum + item.sheetTotal, 0);
  const subject = judge ? `${judge.judgeName ?? 'No judge assigned'}'s packet` : null;
  const printLabel = judge
    ? `Print ${judge.judgeName ?? 'No judge assigned'}'s packet`
    : `Print all ${plural(packet?.judges.length ?? 0, 'packet', 'packets')}`;

  const print = async () => {
    if (!packet || !frameReady) return;
    setPrinting(true);
    try {
      const closed = await printIframeAndWait(frameRef);
      if (!closed) {
        toast('The packet is still building. It will be ready in a moment.');
        return;
      }
      if (!user) return;
      const result = await recordTrialPacketPrint({
        showId,
        trialId,
        classIds: printedJudges.flatMap(item => item.classes.map(cls => cls.classId)),
        classes: (classes ?? []) as DbClass[],
        entries: (entries ?? []) as DbEntry[],
        user,
      });
      if (result.failedClassIds.length > 0) {
        toast.error(
          `${plural(result.failedClassIds.length, 'class', 'classes')} could not be recorded as printed. Try Print again.`
        );
      }
      setPrinted({
        ...result,
        label: subject
          ? `${plural(result.classCount, 'class', 'classes')} marked as printed (${subject})`
          : `All ${plural(result.classCount, 'class', 'classes')} marked as printed with ${packet.trialLabel}`,
      });
    } finally {
      setPrinting(false);
    }
  };

  const undo = async () => {
    if (!printed || !user) return;
    for (const recordId of printed.recordIds) {
      await voidPaperworkPrint({
        recordId,
        user,
        reason: 'Undid print record',
        failureMessage: 'Could not undo that. The sheet is still marked printed.',
      });
    }
    setPrinted(null);
  };

  // Saving a PDF marks nothing as printed.
  const save = () => {
    if (!bytes || !packet) return;
    savePacketPdf(
      bytes,
      packetFileName([
        show?.name ?? null,
        packet.trialLabel,
        judge ? (judge.judgeName ?? 'No judge assigned') : null,
      ])
    );
  };

  if (readiness.blockedMessage) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 p-4 text-sm">
        <span>{readiness.blockedMessage}</span>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!packet) return <p className="p-4 text-sm text-muted-foreground">Getting the trial ready…</p>;
  if (packet.judges.length === 0) {
    return (
      <p className="p-4 text-sm">
        {packet.trialLabel} has no dogs entered yet, so there is nothing to print.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="text-base">
        For{' '}
        <strong>
          {[packet.trialLabel, formatCoverDate(packet.trial.date)].filter(Boolean).join(' · ')}
        </strong>
        , collated <strong>by judge</strong>, for <strong>every dog</strong>.
      </p>
      {packet.emptyClassCount > 0 && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {plural(packet.emptyClassCount, 'class has', 'classes have')} no dogs yet and{' '}
          {packet.emptyClassCount === 1 ? 'is' : 'are'} left out.
        </p>
      )}
      {packet.cancelledClassCount > 0 && (
        <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {plural(packet.cancelledClassCount, 'class is', 'classes are')} cancelled and{' '}
          {packet.cancelledClassCount === 1 ? 'is' : 'are'} left out.
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Each packet holds a cover sheet, then for each class the check-in sheet and the scoresheets.
      </p>
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
          {[null, ...packet.judges].map(item => {
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
                  <span className="block font-medium">
                    {item ? (item.judgeName ?? 'No judge assigned') : 'Every packet'}
                  </span>
                  <span className="block text-muted-foreground">
                    {item
                      ? `${plural(item.classes.length, 'class', 'classes')} · ${plural(item.dogTotal, 'dog', 'dogs')} · ${plural(item.sheetTotal, 'sheet', 'sheets')}`
                      : `${plural(packet.judges.length, 'judge packet', 'judge packets')} · ${plural(
                          packet.judges.reduce(
                            (sum, judgePacket) => sum + judgePacket.sheetTotal,
                            0
                          ),
                          'sheet',
                          'sheets'
                        )}`}
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
      {printed && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
          <span>{printed.label}</span>
          {printed.recordIds.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => void undo()}
            >
              Undo
            </Button>
          )}
        </p>
      )}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {plural(printedJudges.length, 'judge packet', 'judge packets')} ·{' '}
          {plural(sheetTotal, 'sheet', 'sheets')}
        </span>
        <Button
          type="button"
          size="touch"
          disabled={printing || !frameReady}
          onClick={() => void print()}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          {printing ? 'Printing…' : printLabel}
        </Button>
        <Button type="button" size="touch" variant="outline" disabled={!bytes} onClick={save}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Save as PDF
        </Button>
      </div>
    </div>
  );
}
