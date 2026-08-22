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

  // Send-once: the snapshot is immutable, so a second call is a retry of a
  // delivery that may already have landed in a secretary's inbox.
  const { data: sentAttempt } = await supabase
    .from('trial_packet_snapshots')
    .select('recipient_count, page_count')
    .eq('snapshot_id', packet.snapshotId)
    .eq('delivery_status', 'sent')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sentAttempt) {
    return {
      snapshotId: packet.snapshotId,
      generatedAt: packet.generatedAt,
      recipientCount: sentAttempt.recipient_count,
      linkExpiresAt: expiresAt,
      pageCount: sentAttempt.page_count,
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

  let providerMessageId: string | null;
  try {
    providerMessageId = await sendEmail({
      apiKey: resendApiKey,
      snapshotId: packet.snapshotId,
      from: FROM_EMAIL,
      recipients,
      subject: packet.trialDate
        ? `Print for the trial box — ${show.name} emergency packet (${packet.trialDate})`
        : `Print for the trial box — ${show.name} emergency packet`,
      html: buildTrialPacketEmailHtml({
        showName: show.name,
        generatedAt: packet.generatedAt,
        signedUrl: signed.signedUrl,
        expiresAt,
        trialDate: packet.trialDate,
      }),
    });
  } catch (error) {
    const providerStatus =
      error instanceof TrialPacketProviderError ? error.status : 'network_error';
    await supabase.from('trial_packet_snapshots').insert({
      ...auditRow,
      delivery_status: 'failed',
      error_message:
        providerStatus === 'network_error'
          ? 'email_delivery_error'
          : `provider_http_${providerStatus}`,
    });
    throw new HttpError(502, 'The packet was stored, but email delivery failed.');
  }

  const { error: auditError } = await supabase.from('trial_packet_snapshots').insert({
    ...auditRow,
    delivery_status: 'sent',
    provider_message_id: providerMessageId,
    delivered_at: now().toISOString(),
  });
  if (auditError) throw new HttpError(500, 'Email sent, but delivery could not be recorded.');

  return {
    snapshotId: packet.snapshotId,
    generatedAt: packet.generatedAt,
    recipientCount: recipients.length,
    linkExpiresAt: expiresAt,
    pageCount: packet.pageCount,
  };
}
