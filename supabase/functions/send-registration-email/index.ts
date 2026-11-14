// supabase/functions/send-registration-email/index.ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import { requireEmailLogWrite } from '../_shared/emailLog.ts';

import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { applyActiveRoleValidity } from '../_shared/roleValidity.ts';
import { formatUsShowDateRange } from './dateFormat.ts';
import { buildRegistrationEmailHtml, payAtShowMethod } from './registrationEmailHtml.ts';
import { REGISTRATION_ENTRIES_SELECT, mapRegistrationEntries } from './registrationEntries.ts';
import {
  claimSubmissionEntries,
  parseEntryIds,
  releaseSubmissionClaim,
  submissionIdempotencyKey,
  summarizeSubmission,
  type EntryClaimClient,
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

handle<SendRegistrationEmailPayload>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    if (!user) {
      throw new HttpError(401, 'Invalid authorization');
    }

    const { registrationId } = body;
    if (!registrationId) {
      throw new HttpError(400, 'registrationId is required');
    }
    const submittedIds = body.entryIds === undefined ? null : parseEntryIds(body.entryIds);
    if (body.entryIds !== undefined && !submittedIds) {
      throw new HttpError(400, 'entryIds must be a short list of entry ids');
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new HttpError(503, 'Email service not configured');
    }

    // Fetch registration with related data (include auth_user_id for ownership check)
    const { data: registration, error: regError } = await supabase
      .from('enrollments')
      .select(
        '*, show:shows(name, start_date, end_date, location, venue_name, confirmation_message, club_id, secretary_email, cc_secretary_on_exhibitor_emails), person:people(first_name, last_name, email, auth_user_id)'
      )
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      throw new HttpError(404, 'Registration not found');
    }

    // Verify the caller owns this registration or is a secretary/admin for the show
    const isOwner = registration.person?.auth_user_id === user.id;
    let isSecretary = false;
    let isAdmin = false;

    if (!isOwner) {
      // Look up caller's person record (needed for both secretary and admin checks)
      const { data: callerPerson } = await supabase
        .from('people')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (callerPerson) {
        // Check secretary role for show's club
        if (registration.show?.club_id) {
          const { data: secretaryRole, error: secretaryRoleError } = await applyActiveRoleValidity(
            supabase
              .from('user_roles')
              .select('id, role:roles!inner(name)')
              .eq('user_id', callerPerson.id)
              .eq('club_id', registration.show.club_id)
              .eq('roles.name', 'trial_secretary')
          ).maybeSingle();
          if (secretaryRoleError) {
            throw new HttpError(500, 'Failed to verify sender role');
          }
          isSecretary = !!secretaryRole;
        }

        // Check platform admin role via database (SA-014: not JWT claims)
        if (!isSecretary) {
          const { data: adminRole, error: adminRoleError } = await applyActiveRoleValidity(
            supabase
              .from('user_roles')
              .select('id, role:roles!inner(name)')
              .eq('user_id', callerPerson.id)
              .in('roles.name', ['site_admin', 'platform_admin'])
          ).maybeSingle();
          if (adminRoleError) {
            throw new HttpError(500, 'Failed to verify sender role');
          }
          isAdmin = !!adminRole;
        }
      }
    }
    if (!isOwner && !isSecretary && !isAdmin) {
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
      throw new HttpError(400, 'No email address for registrant');
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
    const releaseClaim = async () => {
      if (claimedIds) {
        await releaseSubmissionClaim(supabase as unknown as EntryClaimClient, claimedIds);
      }
    };

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
    const siteUrl = (Deno.env.get('SITE_URL') || 'https://myk9show.com').replace(/\/+$/, '');
    const html = buildRegistrationEmailHtml({
      firstName: registration.person?.first_name || 'there',
      confirmationNumber: registration.confirmation_number || null,
      showName: show?.name || 'Dog Show',
      showDates: formatUsShowDateRange(show?.start_date, show?.end_date),
      showLocation: show?.location || '',
      showVenue: show?.venue_name,
      confirmationMessage: show?.confirmation_message,
      entries: mapRegistrationEntries(entries),
      subtotal: submission ? submission.totalCents : registration.total_amount || 0,
      discount: submission ? 0 : registration.discount_amount,
      total: submission ? submission.totalCents : registration.total_amount || 0,
      paymentMethod: registration.payment_method || 'Payment on file',
      entriesUrl: `${siteUrl}/exhibitor/entries`,
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

    let response: Response;
    try {
      response = await sendResendEmailWithRetry({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
          'Idempotency-Key': claimedIds
            ? await submissionIdempotencyKey(registrationId, claimedIds)
            : registrationId,
        },
        body: JSON.stringify(emailPayload),
      });
    } catch {
      await releaseClaim();
      const { error: logError } = await supabase.from('email_log').insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        show_id: registration.show_id,
        status: 'failed',
        error_message: 'email_delivery_error',
        status_updated_at: new Date().toISOString(),
      });
      requireEmailLogWrite(logError, 'send-registration-email');
      return { success: false };
    }

    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;

    if (response.ok) {
      const result = await response.json();
      resendMessageId = result.id;
      console.log(`Registration email sent: ${result.id}`);
    } else {
      await response.text();
      await releaseClaim();
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
        .update({ confirmation_email_message_id: resendMessageId })
        .in('id', claimedIds);
    }

    return {
      success: sendStatus === 'sent',
      emailLogId: logRow?.id,
    };
  }
);
