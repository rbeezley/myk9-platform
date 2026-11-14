import { supabase } from '@/lib/supabase';

const FUNCTION = 'send-judge-record';

export interface JudgeRecipientPreview {
  judgeName: string;
  /** Where the record would go, or null when the judge needs a download instead. */
  email: string | null;
  reason: 'not_assigned' | 'no_email' | null;
}

export interface JudgeRecordSent {
  judgeName: string;
  email: string;
  /** This exact record already went to this judge, so nothing was sent now. */
  alreadySent: boolean;
  sentAt: string | null;
  linkExpiresAt: string;
}

/** A failure that can be worded for the secretary; `code` is the function's own. */
export class JudgeRecordEmailError extends Error {
  constructor(
    readonly code: 'judge_has_no_email' | 'judge_not_assigned' | 'failed',
    message: string
  ) {
    super(message);
    this.name = 'JudgeRecordEmailError';
  }
}

async function errorFrom(error: unknown): Promise<JudgeRecordEmailError> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { code?: string };
      if (body.code === 'judge_has_no_email') {
        return new JudgeRecordEmailError(
          'judge_has_no_email',
          'This judge has no email on file. Save the PDF and pass it on.'
        );
      }
      if (body.code === 'judge_not_assigned') {
        return new JudgeRecordEmailError(
          'judge_not_assigned',
          'This judge is not assigned to classes on that day.'
        );
      }
    } catch {
      // The body was not JSON: fall through to the generic message.
    }
  }
  return new JudgeRecordEmailError(
    'failed',
    "The judge's record could not be emailed. Save the PDF and pass it on."
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

/**
 * Who would receive this judge's record, asked of the server. The request names the show, the
 * judge's person id and the day, never an address: the server reads the address from the judge's
 * assignment and the email on file.
 */
export async function previewJudgeRecipient(input: {
  showId: string;
  judgeId: string;
  day: string;
}): Promise<JudgeRecipientPreview> {
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: { action: 'preview', ...input },
  });
  if (error || !data) throw await errorFrom(error);
  const result = data as JudgeRecipientPreview;
  return { judgeName: result.judgeName, email: result.email, reason: result.reason };
}

/** Emails the record to the judge the server resolves. `sendAgain` sends a record they already have. */
export async function emailJudgeRecord(input: {
  showId: string;
  judgeId: string;
  day: string;
  bytes: Uint8Array;
  sendAgain?: boolean;
}): Promise<JudgeRecordSent> {
  const { data, error } = await supabase.functions.invoke(FUNCTION, {
    body: {
      action: 'send',
      showId: input.showId,
      judgeId: input.judgeId,
      day: input.day,
      pdfBase64: toBase64(input.bytes),
      ...(input.sendAgain ? { sendAgain: true, attemptId: crypto.randomUUID() } : {}),
    },
  });
  if (error || !data) throw await errorFrom(error);
  const result = data as JudgeRecordSent;
  return {
    judgeName: result.judgeName,
    email: result.email,
    alreadySent: result.alreadySent === true,
    sentAt: result.sentAt ?? null,
    linkExpiresAt: result.linkExpiresAt,
  };
}
