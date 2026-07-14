import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

import { handle } from '../_shared/http/handler.ts';
import { HttpError } from '../_shared/http/responses.ts';
import { requirePushWebhookSecret } from '../_shared/pushWebhookAuth.ts';
import { sendResendEmailWithRetry } from '../_shared/resendEmail.ts';

interface SupportMessageRecord {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  is_from_operator: boolean;
  created_at?: string;
}

interface WebhookPayload {
  type?: 'INSERT';
  table?: string;
  record: SupportMessageRecord;
}

interface Recipient {
  authUserId: string;
  email: string | null;
  name: string;
}

interface RecipientRow {
  auth_user_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

handle<WebhookPayload>({ auth: 'none', beforeBody: requirePushWebhookSecret }, async ({ body: payload, supabase }) => {
  const { record } = payload;
  const { id, ticket_id, sender_id, body, is_from_operator } =
    record ?? ({} as SupportMessageRecord);

  if (!id || !ticket_id || !sender_id || !body) {
    throw new HttpError(400, 'Missing required fields');
  }

  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('id, owner_id, subject')
    .eq('id', ticket_id)
    .single();

  if (ticketError || !ticket) {
    throw new HttpError(404, 'Ticket not found');
  }

  const recipients = is_from_operator
    ? await getOwnerRecipient(supabase, ticket.owner_id)
    : await getSiteAdminRecipients(supabase);
  const recipientUserIds = [...new Set(recipients.map(r => r.authUserId))].filter(
    uid => uid !== sender_id
  );

  if (recipientUserIds.length === 0) {
    return { sent: 0, emailed: 0 };
  }

  const senderName = await getSenderName(supabase, sender_id);
  const actionUrl = is_from_operator
    ? `/support?ticketId=${ticket_id}`
    : `/admin/support?ticketId=${ticket_id}`;
  const pushResult = await sendPushNotifications({
    recipientUserIds,
    senderName,
    ticketId: ticket_id,
    messageId: id,
    subject: ticket.subject,
    body,
    actionUrl,
  });
  const emailed = await sendSupportEmails({
    supabase,
    recipients: recipients.filter(r => recipientUserIds.includes(r.authUserId)),
    senderName,
    ticketId: ticket_id,
    subject: ticket.subject,
    body,
    actionUrl,
  });

  return { ...pushResult, emailed };
});

async function getOwnerRecipient(supabase: SupabaseClient, ownerId: string) {
  const { data } = await supabase
    .from('people')
    .select('auth_user_id, email, first_name, last_name')
    .eq('auth_user_id', ownerId)
    .maybeSingle();
  return data?.auth_user_id ? [mapRecipient(data)] : [];
}

async function getSiteAdminRecipients(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('user_roles')
    .select('people!inner(auth_user_id, email, first_name, last_name), roles!inner(name)')
    .eq('is_active', true)
    .eq('roles.name', 'site_admin')
    .not('people.auth_user_id', 'is', null);
  const people = ((data ?? []) as Array<{ people: RecipientRow | RecipientRow[] | null }>)
    .map(row => (Array.isArray(row.people) ? row.people[0] : row.people))
    .filter((row): row is RecipientRow => !!row);
  return people.map(mapRecipient);
}

async function getSenderName(supabase: SupabaseClient, senderId: string): Promise<string> {
  const { data } = await supabase
    .from('people')
    .select('first_name, last_name')
    .eq('auth_user_id', senderId)
    .maybeSingle();
  return data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || 'Support' : 'Support';
}

function mapRecipient(row: RecipientRow): Recipient {
  return {
    authUserId: row.auth_user_id ?? '',
    email: row.email ?? null,
    name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'there',
  };
}

async function sendPushNotifications(args: {
  recipientUserIds: string[];
  senderName: string;
  ticketId: string;
  messageId: string;
  subject: string;
  body: string;
  actionUrl: string;
}) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) return { sent: 0 };

  const payload = {
    title: `Support reply from ${args.senderName}`,
    body: truncate(args.body, 100),
    data: {
      type: 'support_message',
      messageId: args.messageId,
      ticketId: args.ticketId,
      actionUrl: args.actionUrl,
    },
  };

  const results = await Promise.allSettled(
    args.recipientUserIds.map(async userId => {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ user_id: userId, payload }),
      });
      if (!response.ok) return 0;
      const result = (await response.json()) as { sent?: number };
      return result.sent ?? 0;
    })
  );

  return {
    sent: results.reduce(
      (total, result) => total + (result.status === 'fulfilled' ? result.value : 0),
      0
    ),
  };
}

async function sendSupportEmails(args: {
  supabase: SupabaseClient;
  recipients: Recipient[];
  senderName: string;
  ticketId: string;
  subject: string;
  body: string;
  actionUrl: string;
}): Promise<number> {
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return 0;

  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://myk9-platform-myk9show.vercel.app';
  const url = `${siteUrl}${args.actionUrl}`;
  let sent = 0;
  for (const recipient of args.recipients.filter(r => r.email)) {
    const response = await sendResendEmailWithRetry({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'myK9Show <notifications@myk9show.com>',
        to: recipient.email,
        subject: `Support update: ${args.subject}`,
        html: supportEmailHtml({
          name: recipient.name,
          senderName: args.senderName,
          preview: truncate(args.body, 240),
          url,
        }),
      }),
    });
    if (!response.ok) continue;

    const result = await response.json();
    await args.supabase.from('email_log').insert({
      recipient_email: recipient.email,
      email_type: 'support_notification',
      resend_message_id: result.id,
      related_id: args.ticketId,
      status: 'sent',
    });
    sent++;
  }
  return sent;
}

function supportEmailHtml(input: {
  name: string;
  senderName: string;
  preview: string;
  url: string;
}): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; background: #f3f4f6; margin: 0; padding: 24px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden;">
    <div style="padding: 24px; border-bottom: 1px solid #e5e7eb;">
      <h1 style="font-size: 20px; margin: 0;">Support update</h1>
    </div>
    <div style="padding: 24px;">
      <p>Hi ${escapeHtml(input.name)},</p>
      <p>${escapeHtml(input.senderName)} added a reply:</p>
      <blockquote style="border-left: 4px solid #2563eb; margin: 16px 0; padding: 8px 0 8px 16px; color: #4b5563;">${escapeHtml(input.preview)}</blockquote>
      <p><a href="${escapeHtml(input.url)}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 10px 16px; border-radius: 6px; text-decoration: none;">Open ticket</a></p>
      <p style="font-size: 13px; color: #6b7280;">Replies are handled in myK9Show.</p>
    </div>
  </div>
</body>
</html>`;
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
