import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../_shared/http/responses.ts';
import { loadPacketShow, resolveRecipients, loadPacketRoleRows } from '../_shared/trialPacket/deliverStoredPacket.ts';
import { recordEmailLog, type EmailAttempt } from '../_shared/trialPacket/emailLog.ts';
import { sendTrialPacketEmail, TrialPacketProviderError } from '../_shared/trialPacket/email.ts';
import {
  buildPrintReminderEmailHtml,
  buildPrintReminderSubject,
  decidePrintReminder,
  EMERGENCY_PACKET_REPORT_ID,
  isPrintReminderKind,
  shouldReclaimStaleReminder,
  type PrintConfirmationRow,
  type PrintReminderKind,
} from '../_shared/trialPacket/printReminder.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const REMINDER_LOG = 'trial_packet_print_reminders';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRIAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ReminderRequest {
  showId: string;
  trialDate: string;
  kind: PrintReminderKind;
}

export type ReminderOutcome =
  | { sent: true; recipientCount: number }
  | { sent: false; reason: 'no-packet' | 'already-printed' | 'already-reminded' | 'no-recipients' };

export function validateReminderRequest(body: unknown): ReminderRequest {
  const candidate = (body ?? {}) as Partial<ReminderRequest>;
  if (typeof candidate.showId !== 'string' || !UUID_PATTERN.test(candidate.showId)) {
    throw new HttpError(400, 'A valid showId is required.');
  }
  if (typeof candidate.trialDate !== 'string' || !TRIAL_DATE_PATTERN.test(candidate.trialDate)) {
    throw new HttpError(400, 'trialDate must be YYYY-MM-DD.');
  }
  if (!isPrintReminderKind(candidate.kind)) {
    throw new HttpError(400, 'kind must be evening-before or morning-of.');
  }
  return { showId: candidate.showId, trialDate: candidate.trialDate, kind: candidate.kind };
}

export interface ReminderDeps {
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
  sendEmail?: typeof sendTrialPacketEmail;
}

export async function runPrintReminder(
  supabase: SupabaseClient,
  request: ReminderRequest,
  deps: ReminderDeps = {}
): Promise<ReminderOutcome> {
  const getEnv = deps.getEnv ?? ((name: string) => Deno.env.get(name));
  const now = deps.now ?? (() => new Date());
  const sendEmail = deps.sendEmail ?? sendTrialPacketEmail;

  const show = await loadPacketShow(supabase, request.showId);

  // A reminder to print something that does not exist is noise, and noise is
  // how a channel stops being read. Ask for the packet first.
  const { data: packet, error: packetError } = await supabase
    .from('trial_packet_snapshots')
    .select('snapshot_id')
    .eq('show_id', request.showId)
    .eq('trial_date', request.trialDate)
    .eq('delivery_status', 'sent')
    // Newest first, by the SERVER's clock. `generated_at` is minted by the
    // browser on the manual path, so a slow laptop can make a later packet
    // look older. If client and server then disagree about which snapshot is
    // current, the confirmation names one and the reminder checks the other,
    // and the chase never stops.
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (packetError) throw new HttpError(500, 'Failed to look up the packet.');

  // Scoped to the show and the packet report only — a check-in sheet printed
  // for the same day says nothing about the emergency packet.
  const { data: confirmations, error: confirmationsError } = await supabase
    .from('paperwork_prints')
    .select('report_id, coverage, voided_at')
    .eq('show_id', request.showId)
    .eq('report_id', EMERGENCY_PACKET_REPORT_ID)
    .is('voided_at', null);
  if (confirmationsError) throw new HttpError(500, 'Failed to read print confirmations.');

  const decision = decidePrintReminder({
    hasDeliveredPacket: Boolean(packet),
    confirmations: (confirmations ?? []) as PrintConfirmationRow[],
    trialDate: request.trialDate,
    ...(packet?.snapshot_id ? { currentSnapshotId: packet.snapshot_id as string } : {}),
  });
  if (!decision.remind) return { sent: false, reason: decision.reason };

  // Claim the (show, day, kind) triple. Two sends of the SAME reminder is the
  // failure mode here — the evening and morning sends are deliberately
  // separate rows, because each is a distinct decision to chase.
  let claimedAt = now().toISOString();
  const claimKey = {
    show_id: request.showId,
    trial_date: request.trialDate,
    reminder_kind: request.kind,
  };
  const { error: claimError } = await supabase
    .from(REMINDER_LOG)
    .insert({ ...claimKey, claimed_at: claimedAt });
  if (claimError) {
    if (claimError.code !== '23505') {
      throw new HttpError(500, 'Failed to claim the reminder.');
    }

    // A row exists, but that only proves a reminder was SENT if `sent_at` is
    // set. The migration always described a lease and the first version never
    // implemented one: resolving recipients is two or three round trips, so an
    // isolate dying between the INSERT and the send left a row with a null
    // `sent_at` that suppressed the slot permanently. Treating every conflict
    // as "already reminded" is how a trial day ends up with no paper and no
    // chase.
    const { data: existing, error: existingError } = await supabase
      .from(REMINDER_LOG)
      .select('claimed_at, sent_at')
      .match(claimKey)
      .maybeSingle();
    if (existingError) throw new HttpError(500, 'Failed to read the existing reminder claim.');
    const stale =
      existing &&
      shouldReclaimStaleReminder(
        {
          claimed_at: existing.claimed_at as string,
          sent_at: (existing.sent_at as string | null) ?? null,
        },
        now().getTime()
      );
    if (!stale) return { sent: false, reason: 'already-reminded' };

    // Compare-and-swap: runs overlap on this schedule and two could read the
    // same stale claim. Only the one whose update matches proceeds.
    const reclaimToken = new Date(now().getTime() + 1).toISOString();
    const { data: reclaimed, error: reclaimError } = await supabase
      .from(REMINDER_LOG)
      .update({ claimed_at: reclaimToken })
      .match(claimKey)
      .eq('claimed_at', existing.claimed_at)
      .is('sent_at', null)
      .select('id');
    if (reclaimError) throw new HttpError(500, 'Failed to reclaim the stale reminder.');
    if (!reclaimed?.length) return { sent: false, reason: 'already-reminded' };
    claimedAt = reclaimToken;
  }

  let recipients: string[];
  try {
    recipients = await resolveRecipients(
      supabase,
      show,
      await loadPacketRoleRows(supabase, show)
    );
  } catch (error) {
    // Release: a show with no reachable officials today may have one tomorrow,
    // and a held claim would silence the morning send too.
    await releaseClaim(supabase, request, claimedAt);
    if (error instanceof HttpError && error.status === 422) {
      return { sent: false, reason: 'no-recipients' };
    }
    throw error;
  }

  const resendApiKey = getEnv('RESEND_API_KEY');
  if (!resendApiKey) {
    await releaseClaim(supabase, request, claimedAt);
    throw new HttpError(503, 'Email service not configured.');
  }

  const subject = buildPrintReminderSubject({
    showName: show.name,
    trialDate: request.trialDate,
    kind: request.kind,
  });
  const html = buildPrintReminderEmailHtml({
    showName: show.name,
    trialDate: request.trialDate,
    kind: request.kind,
  });

  // One message per official, matching the packet path. See emailLog.ts: a
  // single multi-recipient message yields one Resend id, and one id cannot
  // carry a per-person delivery result.
  const attempts: EmailAttempt[] = [];
  for (const recipient of recipients) {
    try {
      const messageId = await sendEmail({
        apiKey: resendApiKey,
        // Show, day, slot AND recipient.
        //
        // The show id was already load-bearing: without it two clubs trialling
        // on the same date collide, the second send is answered with a REPLAY
        // of the first — 200, no email — and this function stamps `sent_at`
        // for officials who were never contacted. The recipient is now
        // load-bearing for exactly the same reason one step down: reuse one
        // key across this loop and only the first address is mailed while
        // every later one is handed the first's id back.
        idempotencyKey:
          `print-reminder-${request.showId}-${request.trialDate}-${request.kind}` +
          `-${recipient.toLowerCase()}`,
        from: FROM_EMAIL,
        recipient,
        subject,
        html,
      });
      attempts.push({ recipient, messageId, error: null });
    } catch (error) {
      const status = error instanceof TrialPacketProviderError ? error.status : 'network_error';
      attempts.push({
        recipient,
        messageId: null,
        error: status === 'network_error' ? 'email_delivery_error' : `provider_http_${status}`,
      });
    }
  }

  const delivered = attempts.filter(attempt => attempt.messageId !== null);
  await recordEmailLog(supabase, attempts, {
    emailType: 'trial_packet_print_reminder',
    showId: request.showId,
    relatedId: request.showId,
  });

  // Only a total failure releases the claim. One unreachable official must not
  // cancel the chase for the others -- and must not re-send to the ones who
  // already got it, which releasing the claim would do.
  if (delivered.length === 0) {
    await releaseClaim(supabase, request, claimedAt);
    throw new HttpError(502, `Reminder email failed (${attempts[0]?.error ?? 'unknown'}).`);
  }

  // The mail is already gone. If this stamp does not land, the row keeps a
  // null `sent_at`, the lease expires, and a later run in the same window
  // reclaims it and sends a SECOND identical reminder. So retry once rather
  // than accepting the first failure — a transient blip is the likely cause,
  // and the retry is far cheaper than the duplicate.
  const stampSent = async () =>
    await supabase
      .from(REMINDER_LOG)
      .update({ sent_at: now().toISOString(), recipient_count: delivered.length })
      .match(claimKey)
      .eq('claimed_at', claimedAt);
  let { error: sentError } = await stampSent();
  if (sentError) ({ error: sentError } = await stampSent());
  // Still failing: do NOT throw. The reminder was delivered, and reporting it
  // as an error would invite a manual retry that emails everyone again.
  if (sentError) console.error('remind-print-trial-packet: could not stamp sent_at', sentError);

  return { sent: true, recipientCount: delivered.length };
}

async function releaseClaim(
  supabase: SupabaseClient,
  request: ReminderRequest,
  claimedAt: string
): Promise<void> {
  await supabase
    .from(REMINDER_LOG)
    .delete()
    .match({
      show_id: request.showId,
      trial_date: request.trialDate,
      reminder_kind: request.kind,
    })
    .eq('claimed_at', claimedAt)
    .is('sent_at', null);
}
