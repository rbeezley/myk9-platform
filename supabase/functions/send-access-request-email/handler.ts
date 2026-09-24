// send-access-request-email (MYK9-681): emails for the access-request
// lifecycle — new club, club secretary, and club membership asks.
//
// The client calls this AFTER its request/review RPC has committed, so an
// email failure can never roll back the request or the decision. What to send
// is derived from the request row, never from the body: a PENDING row is the
// "submitted" event and only its requester may trigger it; an APPROVED or
// DENIED row is the decision and only the person recorded as its reviewer may
// trigger it.
//
// Once-only: each (email_type, request, recipient) is claimed in email_log
// BEFORE the provider call, against email_log_access_request_once_idx. A
// retry, a double click or a refresh finds the claim and sends nothing. A
// failed send stays recorded as 'failed' on that claim (the existing
// email-delivery history path) and is not retried automatically.

import { HttpError } from '../_shared/http/responses.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';
import {
  authUserIdForPerson,
  loadAccessRequest,
  roleHolderRecipients,
  type AccessRequestKind,
  type AccessRequestRecord,
  type Person,
  type RecordsClient,
} from './records.ts';
import {
  decisionEmail,
  newClubReceivedEmail,
  reviewerNoticeEmail,
  type EmailMessage,
} from './templates.ts';

const KINDS: readonly AccessRequestKind[] = ['new_club', 'secretary', 'membership'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNIQUE_VIOLATION = '23505';

export interface SendAccessRequestEmailPayload {
  kind?: string;
  requestId?: string;
}

interface WriteResult<T = unknown> {
  data: T | null;
  error: { code?: string } | null;
}

interface EmailLogQuery extends PromiseLike<WriteResult> {
  insert(values: unknown): EmailLogQuery;
  update(values: unknown): EmailLogQuery;
  select(columns: string): EmailLogQuery;
  eq(column: string, value: unknown): EmailLogQuery;
  single(): Promise<WriteResult<{ id: string }>>;
}

export interface AccessRequestEmailClient extends RecordsClient {
  from(table: string): ReturnType<RecordsClient['from']> & EmailLogQuery;
}

export interface SendAccessRequestEmailDeps {
  resendApiKey?: string | null;
  siteUrl: string;
  fromEmail?: string;
  fetchImpl?: typeof fetch;
}

export type DeliveryOutcome = 'sent' | 'skipped' | 'failed';

interface Delivery {
  recipient: Person;
  message: EmailMessage;
}

export function createSendAccessRequestEmailHandler(deps: SendAccessRequestEmailDeps) {
  return async ({
    body,
    user,
    supabase,
  }: {
    body: SendAccessRequestEmailPayload;
    user?: { id: string };
    supabase: AccessRequestEmailClient;
  }) => {
    if (!user) throw new HttpError(401, 'Unauthorized');
    const kind = KINDS.find(candidate => candidate === body.kind);
    if (!kind) throw new HttpError(400, 'Unsupported access request kind');
    if (!body.requestId || !UUID.test(body.requestId)) {
      throw new HttpError(400, 'requestId is required');
    }

    const record = await loadAccessRequest(supabase, kind, body.requestId);
    await assertCallerOwnsEvent(supabase, record, user.id);

    if (!deps.resendApiKey) throw new HttpError(503, 'Email service not configured');

    const deliveries = await plannedDeliveries(supabase, record, deps.siteUrl);
    const outcomes: DeliveryOutcome[] = [];
    for (const delivery of deliveries) {
      outcomes.push(await deliverOnce(supabase, deps, record.id, delivery));
    }

    return {
      event: record.status === 'pending' ? 'submitted' : record.status,
      sent: outcomes.filter(outcome => outcome === 'sent').length,
      skipped: outcomes.filter(outcome => outcome === 'skipped').length,
      failed: outcomes.filter(outcome => outcome === 'failed').length,
    };
  };
}

async function assertCallerOwnsEvent(
  client: AccessRequestEmailClient,
  record: AccessRequestRecord,
  callerId: string
): Promise<void> {
  if (record.status === 'pending') {
    if (record.requesterAuthUserId !== callerId) {
      throw new HttpError(403, 'Only the requester can announce this request');
    }
    return;
  }

  const reviewerAuthId = record.reviewedByPersonId
    ? await authUserIdForPerson(client, record.reviewedByPersonId)
    : null;
  if (!reviewerAuthId || reviewerAuthId !== callerId) {
    throw new HttpError(403, 'Only the reviewer can announce this decision');
  }
}

export async function plannedDeliveries(
  client: AccessRequestEmailClient,
  record: AccessRequestRecord,
  siteUrl: string
): Promise<Delivery[]> {
  if (record.status !== 'pending') {
    return [{ recipient: record.requester, message: decisionEmail(record, siteUrl) }];
  }

  const reviewers =
    record.kind === 'new_club'
      ? await roleHolderRecipients(client, 'site_admin')
      : record.clubId
        ? await roleHolderRecipients(client, 'club_admin', record.clubId)
        : [];
  const notice = reviewerNoticeEmail(record, siteUrl);
  const deliveries: Delivery[] = reviewers.map(recipient => ({ recipient, message: notice }));

  if (record.kind === 'new_club') {
    deliveries.unshift({
      recipient: record.requester,
      message: newClubReceivedEmail(record, siteUrl),
    });
  }
  return deliveries;
}

async function deliverOnce(
  client: AccessRequestEmailClient,
  deps: SendAccessRequestEmailDeps,
  requestId: string,
  delivery: Delivery
): Promise<DeliveryOutcome> {
  const email = delivery.recipient.email;
  if (!email) return 'skipped';

  const claim = await client
    .from('email_log')
    .insert({
      recipient_email: email,
      email_type: delivery.message.emailType,
      related_id: requestId,
      status: 'queued',
      status_updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (claim.error) {
    if (claim.error.code === UNIQUE_VIOLATION) return 'skipped';
    // Without a claim the once-only guarantee does not hold, so do not send.
    console.error('send-access-request-email: could not claim email_log row', {
      code: claim.error.code ?? 'unknown',
      emailType: delivery.message.emailType,
    });
    return 'failed';
  }
  const claimId = claim.data?.id;

  let status: 'sent' | 'failed' = 'failed';
  let resendMessageId: string | null = null;
  let errorMessage: string | null = null;
  try {
    const response = await sendResendEmailWithRetry(
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deps.resendApiKey}`,
          // The claim id is unique per (type, request, recipient), so the
          // provider also de-duplicates anything retried inside this call.
          ...(claimId ? { 'Idempotency-Key': `access-request-${claimId}` } : {}),
        },
        body: JSON.stringify({
          from: deps.fromEmail ?? 'myK9Show <notifications@myk9show.com>',
          to: email,
          subject: delivery.message.subject,
          html: delivery.message.html,
        }),
      },
      deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}
    );
    if (response.ok) {
      const result = (await response.json()) as { id?: string };
      status = 'sent';
      resendMessageId = result.id ?? null;
    } else {
      await response.text();
      errorMessage = `provider_http_${response.status}`;
    }
  } catch {
    errorMessage = 'email_delivery_error';
  }

  if (status === 'failed') {
    console.error('send-access-request-email: delivery failed', {
      emailType: delivery.message.emailType,
      error: errorMessage,
    });
  }

  if (claimId) {
    const { error } = await client
      .from('email_log')
      .update({
        status,
        resend_message_id: resendMessageId,
        error_message: errorMessage,
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', claimId);
    if (error) {
      console.error('send-access-request-email: failed to record delivery outcome', {
        code: error.code ?? 'unknown',
      });
    }
  }
  return status;
}
