import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../http/responses.ts';
import { resolveSignedLinkLifetimeSeconds } from './delivery.ts';
import type { PacketShow } from './deliverStoredPacket.ts';
import { recordEmailLog } from './emailLog.ts';
import { sendTrialPacketEmail, TrialPacketProviderError } from './email.ts';
import {
  buildJudgeRecordDownloadFilename,
  buildJudgeRecordEmailHtml,
  buildJudgeRecordSubject,
  decodeJudgeRecordPdf,
  judgeRecordIdempotencyKey,
  judgeRecordStoragePath,
  resolveJudgeRecordRecipient,
  sha256Hex,
  uuidFromKey,
  type JudgeAssignmentFact,
  type JudgePersonFact,
  type JudgeRecordPayload,
  type JudgeRecordRecipient,
} from './judgeRecord.ts';

const BUCKET = 'trial-packets';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const EMAIL_TYPE = 'judge_record';
/**
 * email_log statuses that mean the mail did NOT reach the judge. Everything else counts as sent:
 * `sent` (written at hand-off), `delivered` (the webhook's upgrade) and any later success state.
 * The writers are the senders ('sent' | 'failed') and resend-webhook ('delivered', 'bounced',
 * 'complained', 'failed', 'suppressed', and 'sent' for a delayed delivery).
 */
const NOT_SENT_STATUSES = ['failed', 'bounced', 'complained', 'suppressed'];

export interface JudgeRecordPreview {
  action: 'preview';
  judgeName: string;
  /** The address the record would go to, or null when the judge needs a download instead. */
  email: string | null;
  /** Why there is no address to send to; null when there is one. */
  reason: 'not_assigned' | 'no_email' | null;
  /** When this show, judge and day was last emailed successfully, or null if it never was. */
  lastSentAt: string | null;
  /** The address that send went to (it may differ from `email` if the judge's address changed). */
  lastSentTo: string | null;
}

export interface JudgeRecordSendResult {
  action: 'send';
  judgeName: string;
  email: string;
  linkExpiresAt: string;
  /** True when nothing was sent because this judge already has this day's record. */
  alreadySent: boolean;
  /** When the latest successful send happened, if `alreadySent`. */
  sentAt: string | null;
}

export interface DeliverJudgeRecordDeps {
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
  /** Injected so tests observe the send without reaching the provider. */
  sendEmail?: typeof sendTrialPacketEmail;
}

interface AssignmentRow {
  class_id: string | null;
  status: string | null;
  class: { deleted_at: string | null; trial: { date: string | null } | null } | null;
}

/**
 * The judge, as the judge assignment names them: the confirmed class-level rows for this person
 * on this show, and the person's email on file. The request supplies the judge's id and the day
 * and nothing else; the address is always read here.
 */
export async function resolveRecipientForRecord(
  supabase: SupabaseClient,
  show: PacketShow,
  judgeId: string,
  day: string
): Promise<JudgeRecordRecipient> {
  // Filtered in TypeScript, not with embedded filters: a PostgREST filter on an embed that does
  // not match drops the parent row silently, which would read as "not assigned".
  const { data: rows, error: assignmentError } = await supabase
    .from('judge_assignments')
    .select('class_id, status, class:classes(deleted_at, trial:trials(date))')
    .eq('show_id', show.id)
    .eq('person_id', judgeId)
    .not('class_id', 'is', null);
  if (assignmentError) throw new HttpError(500, 'Failed to resolve the judge assignment.');
  const assignments: JudgeAssignmentFact[] = ((rows ?? []) as unknown as AssignmentRow[]).map(
    row => ({
      classId: row.class_id,
      status: row.status,
      classDeletedAt: row.class?.deleted_at ?? null,
      classDate: row.class?.trial?.date ?? null,
    })
  );

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('email, first_name, last_name, deleted_at')
    .eq('id', judgeId)
    .maybeSingle();
  if (personError) throw new HttpError(500, "Failed to read the judge's contact.");
  const fact: JudgePersonFact | null = person
    ? {
        email: person.email ?? null,
        firstName: person.first_name ?? null,
        lastName: person.last_name ?? null,
        deletedAt: person.deleted_at ?? null,
      }
    : null;
  return resolveJudgeRecordRecipient({ assignments, person: fact, day });
}

export async function previewJudgeRecord(
  supabase: SupabaseClient,
  show: PacketShow,
  payload: JudgeRecordPayload
): Promise<JudgeRecordPreview> {
  const recipient = await resolveRecipientForRecord(supabase, show, payload.judgeId, payload.day);
  const relatedId = await judgeRecordRelatedId(show.id, payload.judgeId, payload.day);
  const { last } = await loadSendHistory(supabase, show.id, relatedId);
  const lastSentAt = last?.at ?? null;
  const lastSentTo = last?.to ?? null;
  return recipient.kind === 'send'
    ? {
        action: 'preview',
        judgeName: recipient.judgeName,
        email: recipient.email,
        reason: null,
        lastSentAt,
        lastSentTo,
      }
    : {
        action: 'preview',
        judgeName: recipient.judgeName,
        email: null,
        reason: recipient.reason,
        lastSentAt,
        lastSentTo,
      };
}

async function judgeRecordRelatedId(showId: string, judgeId: string, day: string) {
  return uuidFromKey(judgeRecordIdempotencyKey({ showId, judgeId, day }));
}

export interface SendHistory {
  /** The newest send that was not a failure or a bounce, with the address it went to. */
  last: { at: string; to: string | null } | null;
  /** Any email_log row exists for this show, judge and day, whatever its status. */
  anyRow: boolean;
}

/**
 * The one "already sent" check: every email_log row for this show, judge and day, newest first.
 * The first whose status is not a failure is the last send. No count and no cap; a failed or
 * bounced send leaves the day unsent, but it still counts as `anyRow`.
 */
async function loadSendHistory(
  supabase: SupabaseClient,
  showId: string,
  relatedId: string
): Promise<SendHistory> {
  const { data, error } = await supabase
    .from('email_log')
    .select('created_at, status, recipient_email')
    .eq('show_id', showId)
    .eq('related_id', relatedId)
    .eq('email_type', EMAIL_TYPE)
    .order('created_at', { ascending: false });
  if (error) throw new HttpError(500, 'Failed to check whether the record was already sent.');
  const rows = (data ?? []) as {
    created_at: string | null;
    status: string | null;
    recipient_email: string | null;
  }[];
  const success = rows.find(row => row.created_at && !NOT_SENT_STATUSES.includes(row.status ?? ''));
  return {
    last: success ? { at: success.created_at!, to: success.recipient_email ?? null } : null,
    anyRow: rows.length > 0,
  };
}

export async function sendJudgeRecord(
  supabase: SupabaseClient,
  show: PacketShow,
  payload: JudgeRecordPayload,
  deps: DeliverJudgeRecordDeps = {}
): Promise<JudgeRecordSendResult> {
  const getEnv = deps.getEnv ?? ((name: string) => Deno.env.get(name));
  const now = deps.now ?? (() => new Date());
  const sendEmail = deps.sendEmail ?? sendTrialPacketEmail;

  const recipient = await resolveRecipientForRecord(supabase, show, payload.judgeId, payload.day);
  if (recipient.kind === 'download') {
    // The secretary downloads the PDF and passes it on; nothing is sent.
    throw recipient.reason === 'no_email'
      ? new HttpError(
          422,
          'This judge has no email on file. Save the PDF instead.',
          'judge_has_no_email'
        )
      : new HttpError(
          422,
          'This judge is not assigned to classes on that day.',
          'judge_not_assigned'
        );
  }

  const bytes = decodeJudgeRecordPdf(payload.pdfBase64 ?? '');
  if (!bytes) throw new HttpError(413, "The judge's record is not a PDF or is too large to send.");
  const sha256 = await sha256Hex(bytes);
  // The send-once key is show + judge + day, never the PDF's bytes: they change on every build, so
  // a rebuilt PDF would otherwise look like a new record and email the judge again. The content
  // hash only names the stored file.
  const baseKey = judgeRecordIdempotencyKey({
    showId: show.id,
    judgeId: payload.judgeId,
    day: payload.day,
  });
  const relatedId = await uuidFromKey(baseKey);

  const lifetimeSeconds = resolveSignedLinkLifetimeSeconds(show.end_date, now());
  const expiresAt = new Date(now().getTime() + lifetimeSeconds * 1000).toISOString();

  const history = await loadSendHistory(supabase, show.id, relatedId);
  // "Send again" is the same send with this check skipped, on a Resend key of its own.
  if (!payload.sendAgain) {
    const sentAt = history.last?.at ?? null;
    if (sentAt) {
      return {
        action: 'send',
        judgeName: recipient.judgeName,
        email: recipient.email,
        // The link the judge already has: the lifetime that send computed, from when it left.
        linkExpiresAt: new Date(
          new Date(sentAt).getTime() +
            resolveSignedLinkLifetimeSeconds(show.end_date, new Date(sentAt)) * 1000
        ).toISOString(),
        alreadySent: true,
        sentAt,
      };
    }
  }

  const resendApiKey = getEnv('RESEND_API_KEY');
  if (!resendApiKey) throw new HttpError(503, 'Email service not configured.');

  const storagePath = judgeRecordStoragePath(show.id, payload.judgeId, payload.day, sha256);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: 'application/pdf',
    upsert: true,
    cacheControl: '0',
  });
  if (uploadError) throw new HttpError(500, "Failed to store the judge's record.");

  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, lifetimeSeconds, {
      download: buildJudgeRecordDownloadFilename(show.name, payload.day),
    });
  if (signedError || !signed?.signedUrl) {
    throw new HttpError(500, 'Failed to create the private link.');
  }

  // The fixed key only guards a first press that is submitted twice. Once any row exists for the
  // day (a failed or bounced one, or a deliberate send again) the body has a new signed link, which
  // Resend would reject under a reused key, so that send takes a key of its own.
  const idempotencyKey =
    payload.sendAgain || history.anyRow
      ? `${baseKey}-${payload.attemptId ?? crypto.randomUUID()}`
      : baseKey;
  const subject = buildJudgeRecordSubject(show.name, payload.day);
  const html = buildJudgeRecordEmailHtml({
    showName: show.name,
    day: payload.day,
    signedUrl: signed.signedUrl,
    expiresAt,
  });
  try {
    const messageId = await sendEmail({
      apiKey: resendApiKey,
      from: FROM_EMAIL,
      recipient: recipient.email,
      idempotencyKey,
      subject,
      html,
    });
    // No stored copy (MYK9-2115): the body carries a signed link to the PDF, and stored
    // email copies never keep links.
    await recordEmailLog(supabase, [{ recipient: recipient.email, messageId, error: null }], {
      emailType: EMAIL_TYPE,
      showId: show.id,
      relatedId,
    });
  } catch (error) {
    const providerStatus =
      error instanceof TrialPacketProviderError ? error.status : 'network_error';
    await recordEmailLog(
      supabase,
      [
        {
          recipient: recipient.email,
          messageId: null,
          error:
            providerStatus === 'network_error'
              ? 'email_delivery_error'
              : `provider_http_${providerStatus}`,
        },
      ],
      { emailType: EMAIL_TYPE, showId: show.id, relatedId }
    );
    throw new HttpError(502, "The judge's record could not be emailed. Save the PDF instead.");
  }

  return {
    action: 'send',
    judgeName: recipient.judgeName,
    email: recipient.email,
    linkExpiresAt: expiresAt,
    alreadySent: false,
    sentAt: null,
  };
}
