import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Mail, Printer } from 'lucide-react';
import { toast } from 'sonner';

import type { ResultsClassRow } from '@/features/results-tab/buildResultsClassRows';
import { Button } from '@/components/ui/button';
import { printIframeAndWait } from '@/pages/secretary/ReportsPage/reportPreviewUtils';

import {
  emailJudgeRecord,
  JudgeRecordEmailError,
  previewJudgeRecipient,
  type JudgeRecordSent,
} from './emailJudgeRecord';
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

function whenSent(iso: string | null, timeZone: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleDateString('en-US', { timeZone, month: 'long', day: 'numeric' });
  const time = date
    .toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    .replace(/\s/g, ' ');
  return ` on ${day} at ${time}`;
}

/**
 * The judge's record (MYK9-1924 phase 2b): one judge, one day. Print it, save it as a PDF, or
 * email it to the judge. The email goes to the address the server reads from the judge's class
 * assignment; this panel shows that address before anything is sent and cannot change it. A judge
 * with no email gets the PDF to pass on. Nothing here blocks: a note sits beside a working button.
 */
export function JudgeRecordPanelBody({
  rows,
  entries,
  showName,
  timeZone,
  showId,
  judgeKey,
  day,
}: {
  rows: readonly ResultsClassRow[];
  entries: readonly ReviewEntryInfo[];
  showName: string;
  timeZone: string;
  showId: string;
  judgeKey: string;
  day: string;
}) {
  const { audits, correctionsByEntryId, historySettled } = useJudgeCorrections(rows);
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

  const recipient = useQuery({
    queryKey: ['judge-record-recipient', showId, record?.judgeId, day],
    queryFn: () => previewJudgeRecipient({ showId, judgeId: record!.judgeId, day }),
    enabled: Boolean(record?.judgeId),
    staleTime: 0,
    retry: false,
  });

  const [printing, setPrinting] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<JudgeRecordSent | null>(null);

  if (!record) {
    return historySettled ? (
      <p className="p-4 text-sm">There is nothing to print for this judge on this day.</p>
    ) : (
      <p className="p-4 text-sm text-muted-foreground">Getting the record ready…</p>
    );
  }

  const reminder = record.ready ? judgeRecordReminder(record.registryId) : null;
  const email = recipient.data?.email ?? null;

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

  const send = async (sendAgain: boolean) => {
    if (!bytes || !record.judgeId) return;
    setSending(true);
    try {
      setSent(await emailJudgeRecord({ showId, judgeId: record.judgeId, day, bytes, sendAgain }));
    } catch (error) {
      toast.error(
        error instanceof JudgeRecordEmailError
          ? error.message
          : "The judge's record could not be emailed. Save the PDF and pass it on."
      );
      if (error instanceof JudgeRecordEmailError && error.code !== 'failed')
        void recipient.refetch();
    } finally {
      setSending(false);
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
      {audits.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm"
        >
          <span>
            The score history could not be read, so scores changed after the judge submitted them
            are not marked. You can still print.
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
      <div className="text-sm" role="status">
        {sent ? (
          sent.alreadySent ? (
            <span>
              Already emailed{whenSent(sent.sentAt, timeZone)} to {sent.email}. Send it again only
              if the judge lost it.{' '}
              <Button
                type="button"
                variant="outline"
                className="ml-1 min-h-11"
                disabled={sending}
                onClick={() => void send(true)}
              >
                Send again
              </Button>
            </span>
          ) : (
            <span>
              Sent to {sent.email}. The link works until{' '}
              {new Date(sent.linkExpiresAt).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
              })}
              .
            </span>
          )
        ) : email ? (
          <span>
            The email goes to <strong>{email}</strong>, the address on file for {record.judgeName}.
          </span>
        ) : recipient.isError ? (
          <span className="text-muted-foreground">
            The judge&apos;s email could not be checked. You can still print or save the PDF.
          </span>
        ) : !record.judgeId || recipient.data ? (
          <span className="text-muted-foreground">
            {record.judgeName} has no email on file. Save the PDF and pass it on.
          </span>
        ) : (
          <span className="text-muted-foreground">Checking the judge&apos;s email…</span>
        )}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card px-4 py-3">
        <span className="text-sm text-muted-foreground">
          {plural(record.classCount, 'class', 'classes')} ·{' '}
          {plural(record.pageCount + 1, 'sheet', 'sheets')}
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
        {email && !sent && (
          <Button
            type="button"
            size="touch"
            variant="outline"
            disabled={!bytes || sending}
            onClick={() => void send(false)}
          >
            <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
            {sending ? 'Sending…' : 'Email the judge their record'}
          </Button>
        )}
      </div>
    </div>
  );
}
