import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import {
  emailJudgeRecord,
  JudgeRecordEmailError,
  previewJudgeRecipient,
  type JudgeRecordSent,
} from './emailJudgeRecord';

/** " on December 7 at 2:05 PM", in the show's time zone, or "" for a time that cannot be read. */
export function whenSent(iso: string | null, timeZone: string): string {
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
 * Emailing the judge their record. The server says who would get it and when it last went out
 * (any send that was not a failure or a bounce); the request names the judge and the day, never an
 * address. One send per show, judge and day: once it went, the button reads "Send again", which is
 * a second deliberate send with no count and no cap.
 */
export function useJudgeRecordEmail(input: {
  showId: string;
  judgeId: string;
  day: string;
  bytes: Uint8Array | null;
}) {
  const { showId, judgeId, day, bytes } = input;
  const recipient = useQuery({
    queryKey: ['judge-record-recipient', showId, judgeId, day],
    queryFn: () => previewJudgeRecipient({ showId, judgeId, day }),
    enabled: Boolean(judgeId),
    staleTime: 0,
    retry: false,
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ email: string; sentAt: string } | null>(null);

  const email = sent?.email ?? recipient.data?.email ?? null;
  const lastSentAt = sent?.sentAt ?? recipient.data?.lastSentAt ?? null;

  const send = async () => {
    if (!bytes || !judgeId) return;
    setSending(true);
    try {
      const result: JudgeRecordSent = await emailJudgeRecord({
        showId,
        judgeId,
        day,
        bytes,
        sendAgain: Boolean(lastSentAt),
      });
      // `alreadySent` means another press (or another device) got there first: say when it went.
      setSent({ email: result.email, sentAt: result.sentAt ?? new Date().toISOString() });
    } catch (error) {
      toast.error(
        error instanceof JudgeRecordEmailError
          ? error.message
          : "The judge's record could not be emailed. Save the PDF and pass it on."
      );
      if (error instanceof JudgeRecordEmailError && error.code !== 'failed') {
        void recipient.refetch();
      }
    } finally {
      setSending(false);
    }
  };

  return {
    email,
    lastSentAt,
    sending,
    send,
    checking: Boolean(judgeId) && recipient.isPending,
    checkFailed: recipient.isError,
    noEmail: !email && (!judgeId || Boolean(recipient.data)),
  };
}

export function JudgeRecordEmailStatus({
  email: state,
  judgeName,
  timeZone,
}: {
  email: ReturnType<typeof useJudgeRecordEmail>;
  judgeName: string;
  timeZone: string;
}) {
  const { email, lastSentAt } = state;
  return (
    <div className="text-sm" role="status">
      {email && lastSentAt ? (
        <span>
          Emailed{whenSent(lastSentAt, timeZone)} to <strong>{email}</strong>. Send it again only if
          the judge lost it.
        </span>
      ) : email ? (
        <span>
          The email goes to <strong>{email}</strong>, the address on file for {judgeName}.
        </span>
      ) : state.checkFailed ? (
        <span className="text-muted-foreground">
          The judge&apos;s email could not be checked. You can still print or save the PDF.
        </span>
      ) : state.noEmail ? (
        <span className="text-muted-foreground">
          {judgeName} has no email on file. Save the PDF and pass it on.
        </span>
      ) : (
        <span className="text-muted-foreground">Checking the judge&apos;s email…</span>
      )}
    </div>
  );
}

export function JudgeRecordEmailButton({
  email: state,
  ready,
}: {
  email: ReturnType<typeof useJudgeRecordEmail>;
  ready: boolean;
}) {
  if (!state.email) return null;
  const again = Boolean(state.lastSentAt);
  return (
    <Button
      type="button"
      size="touch"
      variant="outline"
      disabled={!ready || state.sending}
      onClick={() => void state.send()}
    >
      <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
      {state.sending ? 'Sending…' : again ? 'Send again' : 'Email the judge their record'}
    </Button>
  );
}
