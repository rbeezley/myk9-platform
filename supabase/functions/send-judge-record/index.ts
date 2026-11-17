import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import {
  callerRoleAuthorizesPacket,
  payloadContainsRecipientFields,
} from '../_shared/trialPacket/delivery.ts';
import {
  loadPacketShow,
  PACKET_ROLE_SELECT,
  type PacketRoleRow,
} from '../_shared/trialPacket/deliverStoredPacket.ts';
import { previewJudgeRecord, sendJudgeRecord } from '../_shared/trialPacket/deliverJudgeRecord.ts';
import {
  isValidJudgeRecordPayload,
  type JudgeRecordPayload,
} from '../_shared/trialPacket/judgeRecord.ts';

/**
 * send-judge-record: emails a judge their record for one day (MYK9-1924 phase 2b), or says who
 * would receive it. A show manager presses the button; the browser built the PDF.
 *
 * The recipient is never in the request. It is resolved here from `judge_assignments` and the
 * judge's email on file (`_shared/trialPacket/judgeRecord.ts`), and a request that names one is
 * refused. A judge with no email gets a 422 `judge_has_no_email`, and the secretary saves the PDF.
 */
handle<JudgeRecordPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    if (payloadContainsRecipientFields(body)) {
      throw new HttpError(400, 'The judge is resolved from the class assignments.');
    }
    if (!isValidJudgeRecordPayload(body)) {
      throw new HttpError(400, "Invalid judge's record request.");
    }
    if (!user) throw new HttpError(401, 'Unauthorized');

    const show = await loadPacketShow(supabase, body.showId);

    const { data: callerRows, error: callerError } = await applyActiveRoleValidity(
      supabase.from('user_roles').select(PACKET_ROLE_SELECT).eq('auth_user_id', user.id)
    );
    if (callerError) throw new HttpError(500, 'Failed to verify authorization.');
    const authorized = ((callerRows ?? []) as PacketRoleRow[]).some(row =>
      callerRoleAuthorizesPacket(
        { roleName: row.roles?.name ?? null, showId: row.show_id, clubId: row.club_id },
        { id: show.id, clubId: show.club_id }
      )
    );
    if (!authorized) throw new HttpError(403, 'Forbidden: show manager role required.');

    return body.action === 'preview'
      ? await previewJudgeRecord(supabase, show, body)
      : await sendJudgeRecord(supabase, show, body);
  }
);
