import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

function source(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

const classifiedProductionResendWriters = {
  'apps/myk9show/supabase/functions/_shared/alertAdmin.ts': 'platform-operator',
  'apps/myk9show/supabase/functions/cron-process-payouts/index.ts': 'club-finance',
  'apps/myk9show/supabase/functions/stripe-webhook/index.ts': 'show-owned',
  'supabase/functions/admin-invite-user/index.ts': 'platform-account',
  'supabase/functions/admin-invite-user/inviteUserHandler.ts': 'platform-account',
  'supabase/functions/push-trigger-support-message/index.ts': 'platform-support',
  'supabase/functions/push-trigger-waitlist/index.ts': 'show-owned',
  'supabase/functions/send-auth-email/delivery.ts': 'platform-account',
  'supabase/functions/send-confirmation-email/index.ts': 'show-owned',
  'supabase/functions/send-email/index.ts': 'mixed-entry-decision-and-platform',
  'supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts': 'show-owned',
  'supabase/functions/send-registration-email/index.ts': 'show-owned',
  'supabase/functions/send-results/index.ts': 'show-owned',
  'supabase/functions/send-waitlist-invite/index.ts': 'platform-waitlist',
} as const;

function discoverProductionResendWriters(): string[] {
  const writers: string[] = [];
  const visit = (relativeDirectory: string) => {
    for (const entry of readdirSync(resolve(repoRoot, relativeDirectory), {
      withFileTypes: true,
    })) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        entry.name !== 'resendEmail.ts' &&
        source(relativePath).includes('sendResendEmailWithRetry')
      ) {
        writers.push(relativePath);
      }
    }
  };

  visit('apps/myk9show/supabase/functions');
  visit('supabase/functions');
  return writers.sort();
}

describe('MYK9-180 show email delivery source contract', () => {
  it.each([
    [
      'registration confirmations',
      'supabase/functions/send-registration-email/index.ts',
      'show_id: registration.show_id',
    ],
    [
      'Heritage confirmations',
      'supabase/functions/send-confirmation-email/index.ts',
      'show_id: show.id',
    ],
    [
      'lifecycle emails',
      'supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts',
      'show_id: args.job.show_id',
    ],
    [
      'manual entry decisions',
      'supabase/functions/send-email/index.ts',
      'show_id: authzResult.registration.show.id',
    ],
    [
      'waitlist notifications',
      'supabase/functions/push-trigger-waitlist/index.ts',
      'show_id: input.showId',
    ],
    [
      'registry results submissions',
      'supabase/functions/send-results/index.ts',
      'show_id: show.id',
    ],
  ] as const)('%s writes canonical show_id', (_name, path, marker) => {
    const contents = source(path);
    expect(contents).toContain("from('email_log')");
    expect(contents).toContain(marker);
  });

  it('records the legacy Stripe confirmation orchestrator against its server-loaded cart show', () => {
    const contents = source('apps/myk9show/supabase/functions/stripe-webhook/index.ts');
    expect(contents).toContain("email_type: 'registration_confirmation'");
    expect(contents).toContain('show_id: cart.show_id');
    expect(contents).toContain('sendResendEmailWithRetry');
    expect(contents).not.toContain('/functions/v1/send-email');
  });

  it('fails loudly when registration delivery history cannot be recorded', () => {
    const contents = source('supabase/functions/send-registration-email/index.ts');
    expect(contents.match(/requireEmailLogWrite\(logError/g)).toHaveLength(3);
    expect(contents).toContain("error_message: 'missing_recipient'");
    expect(contents).toContain('recipient_email: null');
  });

  it('records a failed Heritage attempt when the recipient address is missing', () => {
    const contents = source('supabase/functions/send-confirmation-email/index.ts');
    const missingRecipientBlock = contents.slice(
      contents.indexOf('if (!recipientEmail)'),
      contents.indexOf('const dogName = entry.dog?.name')
    );
    expect(missingRecipientBlock).toContain("confirmation_email_status: 'failed'");
    expect(missingRecipientBlock).toContain('recipient_email: null');
    expect(missingRecipientBlock).toContain("error_message: 'missing_recipient'");
    expect(missingRecipientBlock).toContain('failed++');
  });

  it('fails loudly on delivery-history write errors for every root show-owned sender', () => {
    for (const path of [
      'supabase/functions/send-registration-email/index.ts',
      'supabase/functions/send-confirmation-email/index.ts',
      'supabase/functions/send-email/index.ts',
      'supabase/functions/send-lifecycle-email/lifecycle-email-handler.ts',
      'supabase/functions/push-trigger-waitlist/index.ts',
      'supabase/functions/send-results/index.ts',
    ]) {
      expect(source(path), path).toContain('requireEmailLogWrite');
    }
  });

  it('records a failed entry-decision attempt when its recipient is unresolved', () => {
    const contents = source('supabase/functions/send-email/index.ts');
    const missingRecipientBlock = contents.slice(
      contents.indexOf('if (!resolved)'),
      contents.indexOf('recipient = resolved.to')
    );
    expect(missingRecipientBlock).toContain("data.type === 'entry_decision'");
    expect(missingRecipientBlock).toContain('recipient_email: null');
    expect(missingRecipientBlock).toContain("error_message: 'recipient_unresolved'");
    expect(missingRecipientBlock).toContain('requireEmailLogWrite');
  });

  it('records locally known results-submission configuration failures', () => {
    const contents = source('supabase/functions/send-results/index.ts');
    expect(contents).toContain("error_message: 'registry_destination_unconfigured'");
    expect(contents).toContain("error_message: 'email_not_configured'");
    expect(
      contents.match(/requireEmailLogWrite\(logError, 'send-results'\)/g)?.length
    ).toBeGreaterThanOrEqual(5);
  });

  it('classifies every production Resend writer', () => {
    expect(discoverProductionResendWriters()).toEqual(
      Object.keys(classifiedProductionResendWriters).sort()
    );
  });

  it.each([
    'supabase/functions/send-auth-email/delivery.ts',
    'supabase/functions/push-trigger-support-message/index.ts',
    'supabase/functions/send-waitlist-invite/index.ts',
    'supabase/functions/admin-invite-user/index.ts',
    'supabase/functions/admin-invite-user/inviteUserHandler.ts',
    'apps/myk9show/supabase/functions/_shared/alertAdmin.ts',
    'apps/myk9show/supabase/functions/cron-process-payouts/index.ts',
  ])('%s remains platform-scoped', path => {
    const contents = source(path);
    expect(contents).not.toContain("email_type: 'registration_confirmation'");
    expect(contents).not.toContain("email_type: 'show_lifecycle_email'");
    expect(contents).not.toContain("email_type: 'waitlist_notification'");
    expect(contents).not.toContain("email_type: 'registry_results_submission'");
  });

  it('keeps the RPC as the only app read surface for delivery history', () => {
    const page = source('apps/myk9show/src/features/messages/pages/SecretaryMessagesPage.tsx');
    expect(page).toContain('DeliveryHistory');
    expect(page).not.toContain("from('email_log')");
  });
});
