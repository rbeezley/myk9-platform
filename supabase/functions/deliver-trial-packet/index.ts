import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import {
  buildPacketDownloadFilename,
  buildTrialPacketEmailHtml,
  callerRoleAuthorizesPacket,
  isValidTrialPacketPayload,
  payloadContainsRecipientFields,
  requirePacketRecipients,
  resolvePacketRecipients,
  resolveSignedLinkLifetimeSeconds,
  type PacketRecipientRole,
  type TrialPacketPayload,
} from './delivery.ts';
import { sendTrialPacketEmail, TrialPacketProviderError } from './email.ts';

const BUCKET = 'trial-packets';
const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';
const ROLE_SELECT =
  'user_id, auth_user_id, club_id, show_id, is_active, expires_at, roles!inner(name), people:people!user_id(email)';

interface RoleRow {
  user_id: string | null;
  club_id: string | null;
  show_id: string | null;
  roles?: { name?: string | null } | null;
  people?: { email?: string | null } | null;
}

function rejectCallerRecipients(body: unknown): void {
  if (payloadContainsRecipientFields(body)) {
    throw new HttpError(400, 'Packet recipients are resolved from current show roles.');
  }
}

function validatePayload(body: TrialPacketPayload): void {
  if (!isValidTrialPacketPayload(body)) {
    throw new HttpError(400, 'Invalid emergency packet metadata.');
  }
}

handle<TrialPacketPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    rejectCallerRecipients(body);
    validatePayload(body);
    if (!user) throw new HttpError(401, 'Unauthorized');

    const { data: show, error: showError } = await supabase
      .from('shows')
      .select('id, name, club_id, end_date')
      .eq('id', body.showId)
      .maybeSingle();
    if (showError) throw new HttpError(500, 'Failed to load the show.');
    if (!show) throw new HttpError(404, 'Show not found.');

    const { data: callerRows, error: callerError } = await applyActiveRoleValidity(
      supabase.from('user_roles').select(ROLE_SELECT).eq('auth_user_id', user.id),
    );
    if (callerError) throw new HttpError(500, 'Failed to verify packet authorization.');
    const showScope = { id: show.id, clubId: show.club_id };
    const authorized = ((callerRows ?? []) as RoleRow[]).some(row =>
      callerRoleAuthorizesPacket(
        { roleName: row.roles?.name ?? null, showId: row.show_id, clubId: row.club_id },
        showScope,
      ),
    );
    if (!authorized) throw new HttpError(403, 'Forbidden: show manager role required.');

    const roleQueries = [
      applyActiveRoleValidity(
        supabase.from('user_roles').select(ROLE_SELECT).eq('show_id', show.id),
      ),
    ];
    if (show.club_id) {
      roleQueries.push(
        applyActiveRoleValidity(
          supabase
            .from('user_roles')
            .select(ROLE_SELECT)
            .eq('club_id', show.club_id)
            .is('show_id', null),
        ),
      );
    }
    const roleRows: RoleRow[] = [];
    for (const query of roleQueries) {
      const { data, error } = await query;
      if (error) throw new HttpError(500, 'Failed to resolve packet recipients.');
      roleRows.push(...((data ?? []) as RoleRow[]));
    }

    const clubPersonIds = roleRows
      .filter(row => row.show_id === null && row.club_id === show.club_id && row.user_id)
      .map(row => row.user_id as string);
    const activeClubMembers = new Set<string>();
    if (show.club_id && clubPersonIds.length > 0) {
      const { data: memberships, error: membershipError } = await supabase
        .from('club_members')
        .select('person_id')
        .eq('club_id', show.club_id)
        .eq('membership_status', 'active')
        .in('person_id', clubPersonIds);
      if (membershipError) throw new HttpError(500, 'Failed to verify packet recipients.');
      for (const membership of memberships ?? []) activeClubMembers.add(membership.person_id);
    }

    let recipients: string[];
    try {
      recipients = requirePacketRecipients(
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
          showScope,
        ),
      );
    } catch (error) {
      throw new HttpError(422, error instanceof Error ? error.message : 'No packet recipients.');
    }

    const filename = `${body.snapshotId}.pdf`;
    const { data: objects, error: objectError } = await supabase.storage
      .from(BUCKET)
      .list(show.id, { search: filename, limit: 2 });
    if (objectError) throw new HttpError(500, 'Failed to verify the stored packet.');
    if (!objects?.some(object => object.name === filename)) {
      throw new HttpError(404, 'Stored emergency packet not found.');
    }

    const lifetimeSeconds = resolveSignedLinkLifetimeSeconds(show.end_date);
    const expiresAt = new Date(Date.now() + lifetimeSeconds * 1000).toISOString();
    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(body.storagePath, lifetimeSeconds, {
        // Otherwise every day's packet saves as the same opaque snapshot UUID.
        download: buildPacketDownloadFilename({
          showName: show.name,
          trialDate: body.trialDate,
          generatedAt: body.generatedAt,
        }),
      });
    if (signedError || !signed?.signedUrl) {
      throw new HttpError(500, 'Failed to create the private packet link.');
    }

    const { data: sentAttempt } = await supabase
      .from('trial_packet_snapshots')
      .select('recipient_count, page_count')
      .eq('snapshot_id', body.snapshotId)
      .eq('delivery_status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sentAttempt) {
      return {
        snapshotId: body.snapshotId,
        generatedAt: body.generatedAt,
        recipientCount: sentAttempt.recipient_count,
        linkExpiresAt: expiresAt,
        pageCount: sentAttempt.page_count,
      };
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) throw new HttpError(503, 'Email service not configured.');

    let providerMessageId: string | null;
    try {
      providerMessageId = await sendTrialPacketEmail({
        apiKey: resendApiKey,
        snapshotId: body.snapshotId,
        from: FROM_EMAIL,
        recipients,
        subject: body.trialDate
          ? `Print for the trial box — ${show.name} emergency packet (${body.trialDate})`
          : `Print for the trial box — ${show.name} emergency packet`,
        html: buildTrialPacketEmailHtml({
          showName: show.name,
          generatedAt: body.generatedAt,
          signedUrl: signed.signedUrl,
          expiresAt,
          trialDate: body.trialDate,
        }),
      });
    } catch (error) {
      const providerStatus =
        error instanceof TrialPacketProviderError ? error.status : 'network_error';
      await supabase.from('trial_packet_snapshots').insert({
        snapshot_id: body.snapshotId,
        show_id: show.id,
        storage_path: body.storagePath,
        generated_at: body.generatedAt,
        generated_by: user.id,
        sha256: body.sha256,
        page_count: body.pageCount,
        byte_size: body.byteSize,
        delivery_status: 'failed',
        recipient_count: recipients.length,
        signed_link_expires_at: expiresAt,
        error_message:
          providerStatus === 'network_error'
            ? 'email_delivery_error'
            : `provider_http_${providerStatus}`,
      });
      throw new HttpError(502, 'The packet was stored, but email delivery failed.');
    }
    const { error: auditError } = await supabase.from('trial_packet_snapshots').insert({
      snapshot_id: body.snapshotId,
      show_id: show.id,
      storage_path: body.storagePath,
      generated_at: body.generatedAt,
      generated_by: user.id,
      sha256: body.sha256,
      page_count: body.pageCount,
      byte_size: body.byteSize,
      delivery_status: 'sent',
      recipient_count: recipients.length,
      provider_message_id: providerMessageId,
      delivered_at: new Date().toISOString(),
      signed_link_expires_at: expiresAt,
    });
    if (auditError) throw new HttpError(500, 'Email sent, but delivery could not be recorded.');

    return {
      snapshotId: body.snapshotId,
      generatedAt: body.generatedAt,
      recipientCount: recipients.length,
      linkExpiresAt: expiresAt,
      pageCount: body.pageCount,
    };
  },
);
