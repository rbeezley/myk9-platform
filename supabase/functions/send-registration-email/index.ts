// supabase/functions/send-registration-email/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { isReceiptSweepCaller } from './systemCaller.ts';
import { roleManagesShow, type CallerRoleRow } from './showOfficial.ts';
import {
  formatStreetAddress,
  loadJudgeNamesByClass,
  myShowsUrl,
  type ClassJudgeClient,
} from '../_shared/exhibitorEmailFacts.ts';
import { formatUsShowDateRange } from './dateFormat.ts';
import { buildRegistrationEmailHtml, payAtShowMethod } from './registrationEmailHtml.ts';
import { REGISTRATION_ENTRIES_SELECT, mapRegistrationEntries } from './registrationEntries.ts';
import {
  claimSubmissionEntries,
  markReceiptsFailedBeforeClaim,
  parseEntryIds,
  releaseClaimOnThrow,
  releaseSubmissionClaim,
  submissionIdempotencyKey,
  summarizeSubmission,
  type EntryClaimClient,
  type EntryFailMarkClient,
} from './submissionReceipt.ts';

const FROM_EMAIL = 'myK9Show <notifications@myk9show.com>';

// Mirrors apps/myk9show/src/services/notifications/ccSecretary.ts — Deno cannot import from apps/.
function resolveSecretaryCc(
  ccToggle: boolean | null | undefined,
  secretaryEmail: string | null | undefined
): string[] {
  const enabled = ccToggle ?? true;
  if (!enabled) return [];
  if (!secretaryEmail) return [];
  return [secretaryEmail];
}

interface SendRegistrationEmailPayload {
  registrationId?: string;
  /**
   * The entries a check or cash submission just created. Present: send the ONE receipt for
   * exactly those entries, once. Absent: a resend of the registration as it stands.
   */
  entryIds?: unknown;
}

// auth: 'none' because two kinds of caller reach this function: a signed-in person (validated
// below, exactly as the envelope's 'jwt' mode did) and the scheduled receipt sweep, which has
// no user and proves itself with the HERITAGE_CONFIRMATION_SECRET header (MYK9-1963).
handle<SendRegistrationEmailPayload>(
  { auth: 'none', origins: MYK9SHOW_ORIGINS },
  async ({ req, body, supabase }) => {
    const isSweep = isReceiptSweepCaller(req, name => Deno.env.get(name));
    let user: { id: string } | undefined;
    if (!isSweep) {
      const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
      if (!token) throw new HttpError(401, 'Unauthorized');
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) throw new HttpError(401, 'Unauthorized');
      user = data.user;
    }

    const { registrationId } = body;
    if (!registrationId) {
      throw new HttpError(400, 'registrationId is required');
    }
    const submittedIds = body.entryIds === undefined ? null : parseEntryIds(body.entryIds);
    if (body.entryIds !== undefined && !submittedIds) {
      throw new HttpError(400, 'entryIds must be a short list of entry ids');
    }
    if (isSweep && !submittedIds) {
      throw new HttpError(400, 'The receipt sweep names the entries it retries');
    }

    const markFailed = () =>
      markReceiptsFailedBeforeClaim(
        supabase as unknown as EntryFailMarkClient,
        registrationId,
        submittedIds
      );

    // Fetch registration with related data (include auth_user_id for ownership check)
    const { data: registration, error: regError } = await supabase
      .from('enrollments')
      .select(
        '*, show:shows(name, start_date, end_date, location, venue_name, address, city, state, zip_code, club_id, secretary_email, cc_secretary_on_exhibitor_emails), person:people(first_name, last_name, email, auth_user_id)'
      )
      .eq('id', registrationId)
      .single();

    if (regError) {
      // A read failure, not a missing registration: the entries are retried by the sweep.
      await markFailed();
    }
    if (regError || !registration) {
      throw new HttpError(404, 'Registration not found');
    }

    // Verify the caller owns this registration or manages its show (MYK9-1999: a show official
    // keying a mail-in entry has its receipt sent; access is club-derived, see showOfficial.ts).
    const isOwner = !!user && registration.person?.auth_user_id === user.id;
    let managesShow = false;
    if (!isOwner && user) {
      const { data: roles, error: roleError } = await applyActiveRoleValidity(
        supabase
          .from('user_roles')
          .select('id, club_id, auth_user_id, is_active, expires_at, roles!inner(name)')
          .eq('auth_user_id', user.id)
      );
      if (roleError) {
        throw new HttpError(500, 'Failed to verify sender role');
      }
      const show = {
        id: registration.show_id as string,
        club_id: registration.show?.club_id ?? null,
      };
      managesShow = ((roles ?? []) as CallerRoleRow[]).some(role => roleManagesShow(role, show));
    }
    if (!isSweep && !isOwner && !managesShow) {
      throw new HttpError(403, 'Not authorized');
    }

    // Fetch entries: the submission's own entries, or the whole registration for a resend
    let entriesQuery = supabase
      .from('entries')
      .select(`id, entry_fee, payment_method, payment_status, ${REGISTRATION_ENTRIES_SELECT}`)
      .eq('registration_id', registrationId);
    if (submittedIds) entriesQuery = entriesQuery.in('id', submittedIds);
    const { data: fetchedEntries } = await entriesQuery;
    let entries = fetchedEntries ?? [];
    if (submittedIds && entries.length !== submittedIds.length) {
      throw new HttpError(400, 'Entries do not belong to this registration');
    }

    const recipientEmail = registration.person?.email;
    if (!recipientEmail) {
      const { error: logError } = await supabase.from('email_log').insert({
        recipient_email: null,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        show_id: registration.show_id,
        status: 'failed',
        error_message: 'missing_recipient',
        status_updated_at: new Date().toISOString(),
      });
      requireEmailLogWrite(logError, 'send-registration-email');
      await markFailed();
      throw new HttpError(400, 'No email address for registrant');
    }

    // Checked after the caller is authorised and the entries are known to belong to this
    // registration, so the sweep can retry them once the key is configured.
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      await markFailed();
      throw new HttpError(503, 'Email service not configured');
    }

    // Once per submission: claim the entries first. A retry or a second call claims nothing.
    let claimedIds: string[] | null = null;
    if (submittedIds) {
      claimedIds = await claimSubmissionEntries(
        supabase as unknown as EntryClaimClient,
        submittedIds,
        new Date().toISOString()
      );
      if (claimedIds.length === 0) return { success: true, alreadySent: true };
      entries = entries.filter((entry: { id: string }) => claimedIds?.includes(entry.id));
    }
    // False when the release itself failed (already logged): the failure response says so.
    const releaseClaim = async (): Promise<boolean> => {
      if (!claimedIds) return true;
      return releaseSubmissionClaim(supabase as unknown as EntryClaimClient, claimedIds);
    };

    // Everything from the claim to the send releases the claim on any throw.
    const { emailPayload, idempotencyKey } = await releaseClaimOnThrow(releaseClaim, async () => {
      const secretaryCc = resolveSecretaryCc(
        registration.show?.cc_secretary_on_exhibitor_emails,
        registration.show?.secretary_email
      );

      const show = registration.show;
      const submission = claimedIds ? summarizeSubmission(entries) : null;
      const payAtShow = submission
        ? submission.payAtShow
        : payAtShowMethod(registration.payment_method, registration.payment_status);
      let clubName: string | undefined;
      if (payAtShow === 'check' && show?.club_id) {
        const { data: club } = await supabase
          .from('clubs')
          .select('name')
          .eq('id', show.club_id)
          .maybeSingle();
        clubName = club?.name ?? undefined;
      }
      const judgesByClass = await loadJudgeNamesByClass(
        supabase as unknown as ClassJudgeClient,
        entries.map((entry: { class_id?: string | null }) => entry.class_id)
      );
      const html = buildRegistrationEmailHtml({
        firstName: registration.person?.first_name || 'there',
        confirmationNumber: registration.confirmation_number || null,
        showName: show?.name || 'Dog Show',
        showDates: formatUsShowDateRange(show?.start_date, show?.end_date),
        showLocation: show?.location || '',
        showVenue: show?.venue_name,
        streetAddress: formatStreetAddress(show),
        entries: mapRegistrationEntries(entries, judgesByClass),
        subtotal: submission ? submission.totalCents : registration.total_amount || 0,
        discount: submission ? 0 : registration.discount_amount,
        total: submission ? submission.totalCents : registration.total_amount || 0,
        paymentMethod: registration.payment_method || 'Payment on file',
        entriesUrl: myShowsUrl(Deno.env.get('SITE_URL')),
        clubName,
        payAtShow,
      });

      // Send via Resend with idempotency key
      const emailPayload: {
        from: string;
        to: string;
        subject: string;
        html: string;
        cc?: string[];
      } = {
        from: FROM_EMAIL,
        to: recipientEmail,
        subject: `Registration Confirmed - ${registration.confirmation_number || 'myK9Show'}`,
        html,
      };

      if (secretaryCc.length > 0) {
        emailPayload.cc = secretaryCc;
      }
      const idempotencyKey = claimedIds
        ? await submissionIdempotencyKey(registrationId, claimedIds)
        : registrationId;
      return { emailPayload, idempotencyKey };
    });

    let response: Response;
    try {
      response = await sendResendEmailWithRetry({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(emailPayload),
      });
    } catch {
      const claimReleased = await releaseClaim();
      const { error: logError } = await supabase.from('email_log').insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        show_id: registration.show_id,
        subject: emailPayload.subject,
        body_html: emailPayload.html,
        status: 'failed',
        error_message: 'email_delivery_error',
        status_updated_at: new Date().toISOString(),
      });
      requireEmailLogWrite(logError, 'send-registration-email');
      return claimReleased ? { success: false } : { success: false, claimReleased };
    }

    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;
    let claimReleased = true;

    if (response.ok) {
      const result = await response.json();
      resendMessageId = result.id;
      console.log(`Registration email sent: ${result.id}`);
    } else {
      await response.text();
      claimReleased = await releaseClaim();
      sendStatus = 'failed';
      errorMessage = `provider_http_${response.status}`;
      console.error('Resend API error', { status: response.status });
    }

    // Write email_log
    const { data: logRow, error: logError } = await supabase
      .from('email_log')
      .insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        show_id: registration.show_id,
        // MYK9-1999: what the email said, so the secretary can read it from Delivery history.
        subject: emailPayload.subject,
        body_html: emailPayload.html,
        resend_message_id: resendMessageId,
        status: sendStatus,
        error_message: errorMessage,
      })
      .select('id')
      .single();

    requireEmailLogWrite(logError, 'send-registration-email');

    if (claimedIds && resendMessageId) {
      await supabase
        .from('entries')
        .update({ receipt_email_message_id: resendMessageId })
        .in('id', claimedIds);
    }

    return {
      success: sendStatus === 'sent',
      emailLogId: logRow?.id,
      ...(claimReleased ? {} : { claimReleased }),
    };
  }
);
