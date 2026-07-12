import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260705013523_support_tickets.sql'),
  'utf8'
);
const pushFunction = readFileSync(
  resolve(repoRoot, 'supabase/functions/push-trigger-support-message/index.ts'),
  'utf8'
);
const sendEmailFunction = readFileSync(
  resolve(repoRoot, 'supabase/functions/send-email/index.ts'),
  'utf8'
);
const supportNotificationEmail = readFileSync(
  resolve(repoRoot, 'supabase/functions/send-email/supportNotificationEmail.ts'),
  'utf8'
);
const sendEmailAuthz = readFileSync(
  resolve(repoRoot, 'supabase/functions/send-email/authz.ts'),
  'utf8'
);

describe('support notifications contract', () => {
  it('fires one webhook trigger per inserted support message', () => {
    expect(migration).toContain('create or replace function public.notify_support_message()');
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("where name = 'edge_function_base_url'");
    expect(migration).toContain("where name = 'push_webhook_secret'");
    expect(migration).toContain("edge_function_base_url || '/push-trigger-support-message'");
    expect(migration).toContain("'Authorization', 'Bearer ' || webhook_secret");
    expect(migration).toContain('after insert on public.support_ticket_messages');
    expect(migration).toContain('for each row');
    expect(migration).toContain(
      'revoke all on function public.notify_support_message() from public'
    );
  });

  it('routes owner messages to site admins and operator messages to the owner', () => {
    expect(pushFunction).toContain("from '../_shared/pushWebhookAuth.ts'");
    expect(pushFunction).toContain('beforeBody: requirePushWebhookSecret');
    expect(pushFunction.match(/SUPABASE_SERVICE_ROLE_KEY/g)).toHaveLength(1);
    expect(pushFunction).toContain('is_from_operator');
    expect(pushFunction).toContain('await getOwnerRecipient(supabase, ticket.owner_id)');
    expect(pushFunction).toContain('await getSiteAdminRecipients(supabase)');
    expect(pushFunction).toContain(".eq('roles.name', 'site_admin')");
    expect(pushFunction).toContain("type: 'support_message'");
    expect(pushFunction).toContain('`/support?ticketId=${ticket_id}`');
    expect(pushFunction).toContain('`/admin/support?ticketId=${ticket_id}`');
    expect(pushFunction).toContain('/functions/v1/send-push-notification');
    expect(pushFunction).toContain('Authorization: `Bearer ${serviceRoleKey}`');
  });

  it('sends support notification email with in-app links and no reply-to path', () => {
    expect(pushFunction).toContain("email_type: 'support_notification'");
    expect(pushFunction).toContain('related_id: args.ticketId');
    expect(pushFunction).toContain('Open ticket');
    expect(pushFunction).not.toMatch(/reply[-_]?to/i);

    expect(supportNotificationEmail).toContain("type: 'support_notification'");
    expect(sendEmailFunction).toContain('generateSupportNotificationEmail(data)');
    expect(supportNotificationEmail).toContain('function generateSupportNotificationEmail');
    expect(supportNotificationEmail).toContain('Replies are handled in myK9Show.');
    expect(sendEmailFunction).not.toMatch(/reply[-_]?to/i);
    expect(supportNotificationEmail).not.toMatch(/reply[-_]?to/i);
  });

  it('authorizes direct support_notification emails by ticket access', () => {
    expect(sendEmailAuthz).toContain("args.data.type === 'support_notification'");
    expect(sendEmailAuthz).toContain(".from('support_tickets')");
    expect(sendEmailAuthz).toContain("select('id, owner_id')");
    expect(sendEmailAuthz).toContain('ticket.owner_id !== args.user?.id');
    expect(sendEmailAuthz).toContain("role.roles?.name === 'site_admin'");
  });

  it('derives the support_notification recipient from the ticket owner, not the request body (SA-018)', () => {
    // The ticket's owner_id is an auth.users id; resolve it to an email via
    // the `people` row linked by auth_user_id, then hand it to the pure
    // recipient-resolution helper so Resend never sees a body-supplied `to`.
    expect(sendEmailAuthz).toContain('resolveTicketOwnerEmail(args.supabase, ticket.owner_id)');
    expect(sendEmailAuthz).toContain(".from('people')");
    expect(sendEmailAuthz).toContain("eq('auth_user_id', ownerId)");
    expect(sendEmailAuthz).toContain(
      "return { type: 'support_notification', ticket: { ownerEmail } };"
    );

    expect(sendEmailFunction).toContain('resolveDerivedRecipient(authzResult)');
    expect(sendEmailFunction).not.toContain('to: data.to');
  });
});
