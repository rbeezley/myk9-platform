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

export interface JudgeRecordPreview {
  action: 'preview';
  judgeName: string;
  /** The address the record would go to, or null when the judge needs a download instead. */
  email: string | null;
  /** Why there is no address to send to; null when there is one. */
  reason: 'not_assigned' | 'no_email' | null;
}

export interface JudgeRecordSendResult {
  action: 'send';
  judgeName: string;
  email: string;
  linkExpiresAt: string;
  /** True when nothing was sent because this exact record already went to this judge. */
  alreadySent: boolean;
  /** When the earlier send happened, if `alreadySent`. */
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
  return recipient.kind === 'send'
    ? { action: 'preview', judgeName: recipient.judgeName, email: recipient.email, reason: null }
    : { action: 'preview', judgeName: recipient.judgeName, email: null, reason: recipient.reason };
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
  const baseKey = judgeRecordIdempotencyKey({
    showId: show.id,
    judgeId: payload.judgeId,
    day: payload.day,
    sha256,
  });
  const relatedId = await uuidFromKey(baseKey);

  const lifetimeSeconds = resolveSignedLinkLifetimeSeconds(show.end_date, now());
  const expiresAt = new Date(now().getTime() + lifetimeSeconds * 1000).toISOString();

  // Send-once for this exact record. A deliberate "send again" skips the check and takes a key of
  // its own, so it reaches the judge with a fresh link rather than replaying the first send.
  if (!payload.sendAgain) {
    const { data: earlier } = await supabase
      .from('email_log')
      .select('created_at')
      .eq('related_id', relatedId)
      .eq('email_type', EMAIL_TYPE)
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (earlier) {
      return {
        action: 'send',
        judgeName: recipient.judgeName,
        email: recipient.email,
        linkExpiresAt: expiresAt,
        alreadySent: true,
        sentAt: earlier.created_at ?? null,
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

  const idempotencyKey = payload.sendAgain ? `${baseKey}-${payload.attemptId}` : baseKey;
  try {
    const messageId = await sendEmail({
      apiKey: resendApiKey,
      from: FROM_EMAIL,
      recipient: recipient.email,
      idempotencyKey,
      subject: buildJudgeRecordSubject(show.name, payload.day),
      html: buildJudgeRecordEmailHtml({
        showName: show.name,
        day: payload.day,
        signedUrl: signed.signedUrl,
        expiresAt,
      }),
    });
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
