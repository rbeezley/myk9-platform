import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import {
  callerRoleAuthorizesPacket,
  isValidTrialPacketPayload,
  payloadContainsRecipientFields,
  type TrialPacketPayload,
} from '../_shared/trialPacket/delivery.ts';
import {
  deliverStoredPacket,
  loadPacketShow,
  PACKET_ROLE_SELECT,
  type PacketRoleRow,
} from '../_shared/trialPacket/deliverStoredPacket.ts';

/**
 * deliver-trial-packet — the MANUAL path: a show manager pressed the button,
 * the browser rendered and uploaded the PDF, and this authorizes them and
 * hands the stored object to the shared delivery step.
 *
 * Everything after authorization lives in `_shared/trialPacket` so the
 * automated generator (MYK9-228 phase 3) delivers through the same code rather
 * than a second copy that drifts.
 */

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

    const show = await loadPacketShow(supabase, body.showId);

    const { data: callerRows, error: callerError } = await applyActiveRoleValidity(
      supabase.from('user_roles').select(PACKET_ROLE_SELECT).eq('auth_user_id', user.id),
    );
    if (callerError) throw new HttpError(500, 'Failed to verify packet authorization.');
    const authorized = ((callerRows ?? []) as PacketRoleRow[]).some(row =>
      callerRoleAuthorizesPacket(
        { roleName: row.roles?.name ?? null, showId: row.show_id, clubId: row.club_id },
        { id: show.id, clubId: show.club_id },
      ),
    );
    if (!authorized) throw new HttpError(403, 'Forbidden: show manager role required.');

    return await deliverStoredPacket(supabase, show, {
      snapshotId: body.snapshotId,
      storagePath: body.storagePath,
      generatedAt: body.generatedAt,
      sha256: body.sha256,
      pageCount: body.pageCount,
      byteSize: body.byteSize,
      trialDate: body.trialDate,
      generatedBy: user.id,
      generatedSource: 'manual',
    });
  },
);
