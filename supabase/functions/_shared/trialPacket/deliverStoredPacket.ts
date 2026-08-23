import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { HttpError } from '../http/responses.ts';
import { applyActiveRoleValidity } from '../roleValidity.ts';
import {
  buildPacketDownloadFilename,
  buildTrialPacketEmailHtml,
  requirePacketRecipients,
  resolvePacketRecipients,
  resolveSignedLinkLifetimeSeconds,
  type PacketRecipientRole,
} from './delivery.ts';
import { recordEmailLog, type EmailAttempt } from './emailLog.ts';
import { sendTrialPacketEmail, TrialPacketProviderError } from './email.ts';

/**
 * Everything that happens to a packet PDF once it is sitting in Storage:
 * resolve who gets it, mint a bounded private link, email it, and record the
 * attempt.
 *
 * Extracted from `deliver-trial-packet` so the automated generator can reach
 * the same code path (MYK9-228 phase 3). The two callers differ ONLY in how
 * they establish the right to act — a show manager's JWT, or the cron secret —
 * and that difference stays in the function handlers. Recipient derivation,
 * the signed-link lifetime, the send-once check and the audit row are
 * identical by construction rather than by review.
 */

const BUCKET = 'trial-packets';
/** Mirrors `trial_packet_snapshots_byte_size_check`. */
const MAX_PACKET_BYTES = 20 * 1024 * 1024;
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
export const PACKET_ROLE_SELECT =
  'user_id, auth_user_id, club_id, show_id, is_active, expires_at, roles!inner(name), people:people!user_id(email)';

export interface PacketRoleRow {
  user_id: string | null;
  club_id: string | null;
  show_id: string | null;
  roles?: { name?: string | null } | null;
  people?: { email?: string | null } | null;
}

export interface PacketShow {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string;
}

export interface StoredPacket {
  snapshotId: string;
  storagePath: string;
  generatedAt: string;
  sha256: string;
  pageCount: number;
  byteSize: number;
  trialDate?: string | undefined;
  /**
   * The auth user who asked for this packet, or null when a schedule did.
   * `trial_packet_generated_source_check` keeps the two consistent: only an
   * `automated` row may omit the author.
   */
  generatedBy: string | null;
  generatedSource: 'manual' | 'automated';
}

export interface PacketDeliveryResult {
  snapshotId: string;
  generatedAt: string;
  recipientCount: number;
  linkExpiresAt: string;
  pageCount: number;
  /**
   * True when this call sent nothing because the day was already delivered.
   *
   * The caller has usually just uploaded a PDF by this point, and that object
   * is now referenced by no snapshot row — so it has to know to clean up and
   * record the day as SKIPPED rather than generated.
   */
  alreadyDelivered: boolean;
  /**
   * False when the mail went out but the audit row did not land.
   *
   * This used to THROW, and that was the worst possible answer: the email is
   * already in the officials' inboxes, so reporting failure made the caller
   * release its claim and send again — and again, because the only thing that
   * writes the `sent` snapshot the retry checks for is the statement that just
   * failed. Up to six identical emails a night. A delivered email is a fact
   * the caller has to be told about even when we could not write it down.
   */
  recorded: boolean;
}

export interface DeliverStoredPacketDeps {
  getEnv?: (name: string) => string | undefined;
  now?: () => Date;
  /** Injected so tests observe the send without reaching the provider. */
  sendEmail?: typeof sendTrialPacketEmail;
}

/** The show fields delivery needs, or an HttpError naming which step failed. */
export async function loadPacketShow(
  supabase: SupabaseClient,
  showId: string,
): Promise<PacketShow> {
  const { data: show, error } = await supabase
    .from('shows')
    .select('id, name, club_id, end_date')
    .eq('id', showId)
    .maybeSingle();
  if (error) throw new HttpError(500, 'Failed to load the show.');
  if (!show) throw new HttpError(404, 'Show not found.');
  return show as PacketShow;
}

/**
 * Every role row that could make someone a packet recipient for this show.
 *
 * Two queries rather than one `.or()`: a role reaches a show either directly
 * (`show_id`) or through the club (`club_id` with `show_id` null), and
 * `applyActiveRoleValidity` already contributes an `or` filter that is easy to
 * break by stacking a second one.
 */
export async function loadPacketRoleRows(
  supabase: SupabaseClient,
  show: PacketShow,
): Promise<PacketRoleRow[]> {
  const queries = [
    applyActiveRoleValidity(
      supabase.from('user_roles').select(PACKET_ROLE_SELECT).eq('show_id', show.id),
    ),
  ];
  if (show.club_id) {
    queries.push(
      applyActiveRoleValidity(
        supabase
          .from('user_roles')
          .select(PACKET_ROLE_SELECT)
          .eq('club_id', show.club_id)
          .is('show_id', null),
      ),
    );
  }

  const rows: PacketRoleRow[] = [];
  for (const query of queries) {
    const { data, error } = await query;
    if (error) throw new HttpError(500, 'Failed to resolve packet recipients.');
    rows.push(...((data ?? []) as PacketRoleRow[]));
  }
  return rows;
}

/**
 * A club-wide role only makes someone staff alongside an ACTIVE membership —
 * a lapsed member keeps the role row and would otherwise keep receiving the
 * show's paperwork.
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  show: PacketShow,
  roleRows: PacketRoleRow[],
): Promise<string[]> {
  const clubPersonIds = roleRows
    .filter(row => row.show_id === null && row.club_id === show.club_id && row.user_id)
    .map(row => row.user_id as string);
  const activeClubMembers = new Set<string>();
  if (show.club_id && clubPersonIds.length > 0) {
    const { data: memberships, error } = await supabase
      .from('club_members')
      .select('person_id')
      .eq('club_id', show.club_id)
      .eq('membership_status', 'active')
      .in('person_id', clubPersonIds);
    if (error) throw new HttpError(500, 'Failed to verify packet recipients.');
    for (const membership of memberships ?? []) activeClubMembers.add(membership.person_id);
  }

  try {
    return requirePacketRecipients(
      resolvePacketRecipients(
        roleRows.map(
          (row): PacketRecipientRole => ({
            roleName: row.roles?.name ?? null,
            showId: row.show_id,
            clubId: row.club_id,
            email: row.people?.email ?? null,
            activeClubMember: row.user_id ? activeClubMembers.has(row.user_id) : false,
          }),
        ),
        { id: show.id, clubId: show.club_id },
      ),
    );
  } catch (error) {
    throw new HttpError(422, error instanceof Error ? error.message : 'No packet recipients.');
  }
}

export async function deliverStoredPacket(
  supabase: SupabaseClient,
  show: PacketShow,
  packet: StoredPacket,
  deps: DeliverStoredPacketDeps = {},
): Promise<PacketDeliveryResult> {
  const getEnv = deps.getEnv ?? ((name: string) => Deno.env.get(name));
  const now = deps.now ?? (() => new Date());
  const sendEmail = deps.sendEmail ?? sendTrialPacketEmail;

  // Refuse BEFORE sending anything. The audit row's CHECK caps byte_size at
  // 20MiB, so an oversized packet used to mail fine and then fail its insert
  // every single time — and the caller read that as "not delivered" and tried
  // again on the next run. Six emails a night, deterministically.
  if (packet.byteSize > MAX_PACKET_BYTES) {
    throw new HttpError(413, 'The generated packet is too large to record or deliver.');
  }

  const recipients = await resolveRecipients(
    supabase,
    show,
    await loadPacketRoleRows(supabase, show),
  );

  // The object must already exist: delivery mails a link, and a signed URL is
  // minted happily for a path holding nothing.
  const filename = `${packet.snapshotId}.pdf`;
  const { data: objects, error: objectError } = await supabase.storage
    .from(BUCKET)
    .list(show.id, { search: filename, limit: 2 });
  if (objectError) throw new HttpError(500, 'Failed to verify the stored packet.');
  if (!objects?.some(object => object.name === filename)) {
    throw new HttpError(404, 'Stored emergency packet not found.');
  }

  const lifetimeSeconds = resolveSignedLinkLifetimeSeconds(show.end_date, now());
  const expiresAt = new Date(now().getTime() + lifetimeSeconds * 1000).toISOString();
  const { data: signed, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(packet.storagePath, lifetimeSeconds, {
      // Otherwise every day's packet saves as the same opaque snapshot UUID.
      download: buildPacketDownloadFilename({
        showName: show.name,
        trialDate: packet.trialDate,
        generatedAt: packet.generatedAt,
      }),
    });
  if (signedError || !signed?.signedUrl) {
    throw new HttpError(500, 'Failed to create the private packet link.');
  }

  // Send-once, on TWO keys. The snapshot id catches a retry of this exact
  // artifact. The (show, day) pair catches the case the snapshot id never
  // can: the secretary pressed the manual button while this run was rendering,
  // so their packet has a different snapshot id and is already in the
  // officials' inboxes. Checked here rather than only at the caller's entry
  // because render-plus-upload is a minutes-wide window.
  const { data: sentAttempt } = await supabase
    .from('trial_packet_snapshots')
    .select('recipient_count, page_count')
    .eq('snapshot_id', packet.snapshotId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let priorAttempt = sentAttempt;
  // AUTOMATED callers only. This guard exists so two cron runs cannot both
  // mail a day, and applying it to the manual button inverts the feature:
  // the secretary re-prepares Saturday's packet precisely BECAUSE three dogs
  // scratched since the 18:00 copy, and this would find that copy, send
  // nothing, and report "stored and emailed" with the old page count. The
  // manual button is the documented escape hatch for late changes; a human
  // pressing it has already decided a second email is warranted.
  if (!priorAttempt && packet.trialDate && packet.generatedSource === 'automated') {
    const { data: sameDay } = await supabase
      .from('trial_packet_snapshots')
      .select('recipient_count, page_count')
      .eq('show_id', show.id)
      .eq('trial_date', packet.trialDate)
      .eq('delivery_status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    priorAttempt = sameDay;
  }
  const sentAttemptResolved = priorAttempt;
  if (sentAttemptResolved) {
    return {
      snapshotId: packet.snapshotId,
      generatedAt: packet.generatedAt,
      recipientCount: sentAttemptResolved.recipient_count,
      linkExpiresAt: expiresAt,
      pageCount: sentAttemptResolved.page_count,
      alreadyDelivered: true,
      recorded: true,
    };
  }

  const resendApiKey = getEnv('RESEND_API_KEY');
  if (!resendApiKey) throw new HttpError(503, 'Email service not configured.');

  const auditRow = {
    snapshot_id: packet.snapshotId,
    show_id: show.id,
    storage_path: packet.storagePath,
    generated_at: packet.generatedAt,
    generated_by: packet.generatedBy,
    generated_source: packet.generatedSource,
    trial_date: packet.trialDate ?? null,
    sha256: packet.sha256,
    page_count: packet.pageCount,
    byte_size: packet.byteSize,
    recipient_count: recipients.length,
    signed_link_expires_at: expiresAt,
  };

  const subject = packet.trialDate
    ? `Print for the trial box — ${show.name} emergency packet (${packet.trialDate})`
    : `Print for the trial box — ${show.name} emergency packet`;
  const html = buildTrialPacketEmailHtml({
    showName: show.name,
    generatedAt: packet.generatedAt,
    signedUrl: signed.signedUrl,
    expiresAt,
    trialDate: packet.trialDate,
  });

  // ONE message per official, not one message addressed to all of them.
  //
  // The single-message form returned a single Resend id for the whole list,
  // and `resend-webhook` keys delivery events on that id -- so one bounce
  // marked the record bounced for everyone. On 2026-08-22 the live packet
  // showed `Bounced` in Resend's list view while the secretary's copy had in
  // fact been Delivered; the bounce belonged to a co-recipient. For a packet
  // whose entire purpose is that SOMEONE has the paper, "did this person get
  // it" has to be answerable per person.
  const attempts: EmailAttempt[] = [];
  for (const recipient of recipients) {
    try {
      const messageId = await sendEmail({
        apiKey: resendApiKey,
        from: FROM_EMAIL,
        recipient,
        // Per RECIPIENT, not per snapshot. Resend replays the original
        // response for a repeated Idempotency-Key, so one key across the loop
        // would send to the first address and hand back its id for all the
        // rest -- logging N successes for one email.
        idempotencyKey: `trial-packet-${packet.snapshotId}-${recipient.toLowerCase()}`,
        subject,
        html,
      });
      attempts.push({ recipient, messageId, error: null });
    } catch (error) {
      const providerStatus =
        error instanceof TrialPacketProviderError ? error.status : 'network_error';
      attempts.push({
        recipient,
        messageId: null,
        error:
          providerStatus === 'network_error'
            ? 'email_delivery_error'
            : `provider_http_${providerStatus}`,
      });
    }
  }

  const delivered = attempts.filter(attempt => attempt.messageId !== null);
  await recordEmailLog(supabase, attempts, {
    emailType: 'trial_packet',
    showId: show.id,
    relatedId: packet.snapshotId,
  });

  // Only a TOTAL failure is a failure. Previously any provider error aborted
  // the whole send, so one unreachable address meant nobody got the packet.
  if (delivered.length === 0) {
    await supabase.from('trial_packet_snapshots').insert({
      ...auditRow,
      recipient_count: 0,
      delivery_status: 'failed',
      error_message: attempts[0]?.error ?? 'email_delivery_error',
    });
    throw new HttpError(502, 'The packet was stored, but email delivery failed.');
  }
  const providerMessageId = delivered[0].messageId;

  const { error: auditError } = await supabase.from('trial_packet_snapshots').insert({
    ...auditRow,
    recipient_count: delivered.length,
    delivery_status: 'sent',
    provider_message_id: providerMessageId,
    delivered_at: now().toISOString(),
  });
  // Deliberately NOT a throw. See `recorded` above: the mail is gone, and
  // saying otherwise causes duplicates rather than preventing them.
  if (auditError) {
    console.error('deliverStoredPacket: email sent but audit insert failed', auditError);
  }

  return {
    snapshotId: packet.snapshotId,
    generatedAt: packet.generatedAt,
    recipientCount: delivered.length,
    linkExpiresAt: expiresAt,
    pageCount: packet.pageCount,
    alreadyDelivered: false,
    recorded: !auditError,
  };
}
